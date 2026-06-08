import os
import tempfile
import modal

# 1. Define the Modal App
app = modal.App("scribe-flow-whisper")

# 2. Define the container image configuration
# We cache base and large-v3 models during the container build step to avoid cold start downloads.
def download_models_fn():
    from faster_whisper import WhisperModel
    import logging
    logging.basicConfig(level=logging.INFO)
    
    print("Pre-downloading base model...")
    WhisperModel("base", device="cpu", compute_type="int8")
    
    print("Pre-downloading large-v3 model...")
    WhisperModel("large-v3", device="cpu", compute_type="int8")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg")  # Required by whisper to process audio files
    .pip_install(
        "faster-whisper==1.0.3",
        "fastapi==0.111.0",
        "python-multipart==0.0.9",
        "requests",
        "nvidia-cublas-cu12",
        "nvidia-cudnn-cu12"
    )
    .run_function(download_models_fn)  # Run model downloads during container build
    .add_local_file(
        local_path=os.path.join(os.path.dirname(__file__), "index.html"),
        remote_path="/root/index.html"
    )
)

# 3. Define the GPU-accelerated Transcriber class
# We request a T4 GPU which is highly cost-effective and available.
# We also set keep_warm=0 to avoid idle charges (container spins down when not used).
@app.cls(
    gpu="T4",
    image=image,
    min_containers=0,
    timeout=600,  # Give it up to 10 minutes for long audio files
    env={
        "LD_LIBRARY_PATH": "/usr/local/lib/python3.10/site-packages/nvidia/cublas/lib:/usr/local/lib/python3.10/site-packages/nvidia/cudnn/lib"
    }
)
class WhisperTranscriber:
    @modal.enter()
    def setup(self):
        self.models = {}

    @modal.method()
    def transcribe(self, audio_bytes: bytes, model_name: str = "base", language: str = "auto") -> dict:
        from faster_whisper import WhisperModel
        import time

        print(f"Loading/retrieving Whisper model: {model_name}...")
        
        # Load the model on-demand and cache it in the GPU container instance memory.
        # CUDA + float16 offers the fastest inference speed on T4 GPU.
        if model_name not in self.models:
            print(f"Initializing WhisperModel('{model_name}') on GPU...")
            self.models[model_name] = WhisperModel(
                model_name, 
                device="cuda", 
                compute_type="float16"
            )
        
        model = self.models[model_name]
        
        # Write the audio bytes to a temporary file for processing
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
            temp_file.write(audio_bytes)
            temp_path = temp_file.name

        print(f"Starting faster-whisper transcription on temp file: {temp_path}")
        start_time = time.time()
        
        try:
            # Configure language parameter
            lang_param = None if language == "auto" else language
            
            # Run the transcription with word-level timestamps enabled
            segments, info = model.transcribe(
                temp_path,
                beam_size=5,
                word_timestamps=True,
                language=lang_param
            )

            # Consume the segments generator
            result_segments = []
            for segment in segments:
                words_list = []
                if segment.words:
                    for word in segment.words:
                        words_list.append({
                            "word": word.word,
                            "start": round(word.start, 2),
                            "end": round(word.end, 2),
                            "probability": round(word.probability, 2)
                        })
                
                result_segments.append({
                    "start": round(segment.start, 2),
                    "end": round(segment.end, 2),
                    "text": segment.text,
                    "words": words_list
                })

            transcription_time = time.time() - start_time
            print(f"Transcribed {info.duration:.2f}s of audio in {transcription_time:.2f}s")

            return {
                "language": info.language,
                "language_probability": round(info.language_probability, 4),
                "duration": round(info.duration, 2),
                "text": "".join([s["text"] for s in result_segments]),
                "segments": result_segments
            }
            
        finally:
            # Clean up the temporary file
            if os.path.exists(temp_path):
                os.remove(temp_path)


# 4. Define the FastAPI application and mounts
from fastapi import FastAPI, UploadFile, File, Query
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware

web_app = FastAPI(title="ScribeFlow API")

# Enable CORS for local cross-origin development calls
web_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@web_app.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    model: str = Query("base", description="Whisper model to use (base, small, medium, large-v3)"),
    language: str = Query("auto", description="Audio language code (e.g. 'en', 'es', or 'auto')")
):
    # Read raw audio bytes
    audio_bytes = await file.read()
    
    # Delegate the heavy lifting to the WhisperTranscriber class on the GPU
    transcriber = WhisperTranscriber()
    result = transcriber.transcribe.remote(
        audio_bytes=audio_bytes, 
        model_name=model, 
        language=language
    )
    return result

@web_app.get("/", response_class=HTMLResponse)
def get_homepage():
    # Attempt to read the index.html file mounted into the container at /root/index.html
    # Fallback to local path if running outside Modal or if file mount structure differs.
    paths_to_check = [
        "/root/index.html",
        os.path.join(os.path.dirname(__file__), "index.html"),
        "index.html"
    ]
    
    for path in paths_to_check:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return HTMLResponse(content=f.read(), status_code=200)
                
    return HTMLResponse(
        content="<h1>ScribeFlow frontend not found!</h1><p>Please ensure index.html exists in the workspace.</p>", 
        status_code=404
    )


# 5. Define the Modal function that serves the FastAPI app
@app.function(
    image=image
)
@modal.asgi_app()
def fastapi_app():
    return web_app
