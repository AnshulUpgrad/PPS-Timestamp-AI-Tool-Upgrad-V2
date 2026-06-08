import os
import tempfile
import modal
from fastapi import FastAPI, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware

# Define the Modal App
app = modal.App("whisper-transcribe")

# Pre-download models to cache them in the image
def download_models_fn():
    from faster_whisper import WhisperModel
    import logging
    logging.basicConfig(level=logging.INFO)
    
    for model_name in ["tiny", "base", "small", "large-v3"]:
        print(f"Pre-downloading {model_name} model...")
        WhisperModel(model_name, device="cpu", compute_type="int8")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg")
    .pip_install(
        "faster-whisper==1.0.3",
        "fastapi==0.111.0",
        "python-multipart==0.0.9",
        "requests",
        "nvidia-cublas-cu12",
        "nvidia-cudnn-cu12"
    )
    .run_function(download_models_fn)
)

# Initialize FastAPI with CORS
web_app = FastAPI()
web_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.cls(
    gpu="T4",
    image=image,
    min_containers=0,
    timeout=600,
    scaledown_window=30,
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
        
        if model_name not in self.models:
            print(f"Initializing WhisperModel('{model_name}') on GPU...")
            self.models[model_name] = WhisperModel(
                model_name, 
                device="cuda", 
                compute_type="float16"
            )
        
        model = self.models[model_name]
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as temp_file:
            temp_file.write(audio_bytes)
            temp_path = temp_file.name

        print(f"Starting faster-whisper transcription on temp file: {temp_path}")
        start_time = time.time()
        
        try:
            lang_param = None if language == "auto" else language
            
            segments, info = model.transcribe(
                temp_path,
                beam_size=5,
                word_timestamps=True,
                language=lang_param
            )

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
                    "id": segment.id,
                    "start": round(segment.start, 2),
                    "end": round(segment.end, 2),
                    "text": segment.text,
                    "words": words_list
                })

            transcription_time = time.time() - start_time
            print(f"Transcribed {info.duration:.2f}s of audio in {transcription_time:.2f}s")

            return {
                "text": "".join([s["text"] for s in result_segments]).strip(),
                "language": info.language,
                "language_probability": round(info.language_probability, 4),
                "duration": round(info.duration, 2),
                "segments": result_segments
            }
            
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

@web_app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Query("base", description="Whisper model to use (base, small, medium, large-v3)"),
    language: str = Query("auto", description="Audio language code (e.g. 'en', 'es', or 'auto')")
):
    file_bytes = await file.read()
    transcriber = WhisperTranscriber()
    return transcriber.transcribe.remote(
        audio_bytes=file_bytes, 
        model_name=model, 
        language=language
    )

@app.function(image=image)
@modal.asgi_app()
def fastapi_app():
    return web_app
