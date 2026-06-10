import os
import sys
import json
import platform
import subprocess
import shutil
import ctypes
import string
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


try:
    from faster_whisper import WhisperModel
    HAS_FASTER_WHISPER = True
except ImportError:
    HAS_FASTER_WHISPER = False

app = Flask(__name__)

# Detect Google Colab environment (checks if /content exists, if Google Drive is mounted, or if Colab env var is set)
IS_COLAB = os.path.exists('/content') or os.path.exists('/content/drive') or 'google.colab' in sys.modules or os.environ.get('IS_COLAB') == 'true'

# Use local uploads folder for all environments (use /tmp on Vercel)
IS_VERCEL = os.environ.get('VERCEL') == '1'
if IS_VERCEL:
    base_dir = '/tmp'
else:
    base_dir = os.path.abspath(os.path.dirname(__file__))

UPLOAD_FOLDER = os.path.join(base_dir, 'uploads')
TRANSCRIPTIONS_FOLDER = os.path.join(base_dir, 'transcriptions')
CONFIG_FILE = os.path.join(base_dir, 'config.json')

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(TRANSCRIPTIONS_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['TRANSCRIPTIONS_FOLDER'] = TRANSCRIPTIONS_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max request size

# Global error handlers — always return JSON so the frontend never gets HTML error pages
@app.errorhandler(413)
def request_entity_too_large(e):
    return jsonify({'error': 'Request payload is too large. Please reduce the number of sentences or file size.'}), 413

@app.errorhandler(500)
def internal_server_error(e):
    return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.errorhandler(Exception)
def unhandled_exception(e):
    import traceback
    print(f"Unhandled exception:\n{traceback.format_exc()}")
    return jsonify({'error': f'Unexpected server error: {str(e)}'}), 500

# Configuration Helpers
def load_prompt_template(filename):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(base_dir, 'markdown_files', filename)
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

class OpenRouterError(Exception):
    def __init__(self, message, status_code=500):
        super().__init__(message)
        self.status_code = status_code

def call_openrouter_api(model_name, prompt, response_schema=None, api_key=None):
    import urllib.request
    import urllib.error
    import json
    
    if not api_key:
        api_key = os.getenv('OPENROUTER_API_KEY') or os.getenv('GEMINI_API_KEY')
        
    if not api_key:
        raise OpenRouterError("OpenRouter API Key is missing. Please configure OPENROUTER_API_KEY in your environment/UI.", 400)
        
    url = "https://openrouter.ai/api/v1/chat/completions"
    
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}',
        'HTTP-Referer': 'https://github.com/AnshulUpgrad/PPS-Timestamp-AI-Tool-Upgrad-V2',
        'X-Title': 'PPS Timestamp AI Tool'
    }
    
    body = {
        "model": model_name,
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ]
    }
    
    if response_schema:
        body["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": "structured_response",
                "strict": True,
                "schema": response_schema
            }
        }
        
    req = urllib.request.Request(url, data=json.dumps(body).encode('utf-8'), headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=180) as response:
            response_data = json.loads(response.read().decode('utf-8'))
            
        choices = response_data.get('choices', [])
        if not choices:
            raise OpenRouterError(f"No response choices received from OpenRouter. Response data: {response_data}", 500)
            
        text_response = choices[0].get('message', {}).get('content', '')
        if not text_response:
            raise OpenRouterError(f"Empty content in OpenRouter response. Response data: {response_data}", 500)
            
        return text_response
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        try:
            error_json = json.loads(error_body)
            error_msg = error_json.get('error', {}).get('message', str(e))
        except Exception:
            error_msg = error_body or str(e)
        raise OpenRouterError(f"OpenRouter HTTP Error ({e.code}): {error_msg}", e.code)
    except Exception as e:
        raise OpenRouterError(f"OpenRouter API call failed: {str(e)}", 500)


def clean_json_response(text_response):
    if not text_response:
        return {}
    
    text = text_response.strip()
    
    # Remove markdown code blocks if present
    if text.startswith("```"):
        # Remove start tag (e.g. ```json or ```)
        first_nl = text.find("\n")
        if first_nl != -1:
            text = text[first_nl:].strip()
        else:
            text = text[3:].strip()
        # Remove end tag (e.g. ```)
        if text.endswith("```"):
            text = text[:-3].strip()
            
    # Try parsing with strict=True first
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        # Try parsing with strict=False (allows raw newlines/tabs inside strings)
        try:
            return json.loads(text, strict=False)
        except json.JSONDecodeError as e2:
            print("Failed to parse JSON response from LLM.")
            print(f"Raw response:\n{text_response}")
            print(f"Strict parse error: {e}")
            print(f"Lenient parse error: {e2}")
            
            # Try removing trailing commas
            try:
                import re
                cleaned = re.sub(r',\s*([\]}])', r'\1', text)
                return json.loads(cleaned, strict=False)
            except Exception:
                pass
                
            raise ValueError(f"JSON Parsing Error: {str(e2)}. Raw output: {text[:300]}")


def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return {'ffmpeg_path': ''}

def save_config(config):
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f)
        return True
    except Exception:
        return False

def get_ffmpeg_command(custom_path=None):
    if custom_path and os.path.exists(custom_path) and os.path.isfile(custom_path):
        return custom_path
    
    # Try global path
    global_ffmpeg = shutil.which('ffmpeg')
    if global_ffmpeg:
        return global_ffmpeg
        
    return None

# Native Tkinter Dialog Subprocess Helper
def run_native_dialog(script):
    try:
        result = subprocess.run([sys.executable, '-c', script], capture_output=True, text=True, timeout=120)
        return result.stdout.strip()
    except Exception as e:
        print(f"Error opening native dialog: {e}")
        return ""

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/env', methods=['GET'])
def get_env():
    return jsonify({
        'is_colab': IS_COLAB,
        'is_vercel': IS_VERCEL
    }), 200

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part in the request'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file:
        filename = secure_filename(file.filename)
        # Ensure filename is unique to avoid overwriting
        base_name, ext = os.path.splitext(filename)
        counter = 1
        unique_name = filename
        while os.path.exists(os.path.join(app.config['UPLOAD_FOLDER'], unique_name)):
            unique_name = f"{base_name}_{counter}{ext}"
            counter += 1
            
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_name)
        file.save(filepath)
        
        size_bytes = os.path.getsize(filepath)
        size_mb = size_bytes / (1024 * 1024)
        
        return jsonify({
            'path': filepath,
            'name': unique_name,
            'size': f"{round(size_mb, 2)} MB",
            'size_bytes': size_bytes
        }), 200
    return jsonify({'error': 'Upload failed'}), 500

@app.route('/api/select-file', methods=['POST'])
def select_file():
    if IS_COLAB:
        return jsonify({
            'mode': 'colab'
        }), 200

    # Local fallback
    script = """
import tkinter as tk
from tkinter import filedialog
root = tk.Tk()
root.withdraw()
root.attributes('-topmost', True)
file_path = filedialog.askopenfilename(
    title="Select Media File",
    filetypes=[
        ("Media Files", "*.mp4 *.webm *.mov *.avi *.mkv *.m4v *.mp3 *.wav *.m4a"),
        ("Video Files", "*.mp4 *.webm *.mov *.avi *.mkv *.m4v"),
        ("Audio Files", "*.mp3 *.wav *.m4a"),
        ("All Files", "*.*")
    ]
)
print(file_path, end="")
root.destroy()
"""
    selected_path = run_native_dialog(script)
    if selected_path and os.path.exists(selected_path) and os.path.isfile(selected_path):
        name = os.path.basename(selected_path)
        size_bytes = os.path.getsize(selected_path)
        size_mb = size_bytes / (1024 * 1024)
        return jsonify({
            'mode': 'local',
            'path': selected_path,
            'name': name,
            'size': f"{round(size_mb, 2)} MB",
            'size_bytes': size_bytes
        }), 200
    return jsonify({'path': '', 'mode': 'local'}), 200

@app.route('/api/settings', methods=['GET', 'POST'])
def handle_settings():
    config = load_config()
    ffmpeg_detected_path = get_ffmpeg_command(config.get('ffmpeg_path'))
    
    if request.method == 'POST':
        data = request.json or {}
        new_path = data.get('ffmpeg_path', '').strip()
        config['ffmpeg_path'] = new_path
        if save_config(config):
            updated_detected = get_ffmpeg_command(new_path)
            return jsonify({
                'message': 'Settings saved successfully',
                'ffmpeg_path': new_path,
                'detected_path': updated_detected,
                'is_valid': updated_detected is not None
            }), 200
        else:
            return jsonify({'error': 'Failed to save config file'}), 500
            
    # GET method
    return jsonify({
        'ffmpeg_path': config.get('ffmpeg_path', ''),
        'detected_path': ffmpeg_detected_path,
        'is_valid': ffmpeg_detected_path is not None
    }), 200

@app.route('/api/config', methods=['GET'])
def get_app_config():
    return jsonify({
        'modal_transcribe_url': os.getenv('MODAL_TRANSCRIBE_URL', '')
    }), 200

@app.route('/api/extract', methods=['POST'])
def extract_audio():
    data = request.json or {}
    video_path = data.get('video_path', '')
    mode = data.get('mode', 'copy') # 'copy' or 'mp3'
    
    config = load_config()
    ffmpeg_cmd = get_ffmpeg_command(config.get('ffmpeg_path'))
    
    if not ffmpeg_cmd:
        return jsonify({
            'error': 'FFmpeg executable not found. Please install FFmpeg or set its custom path in Settings.'
        }), 400
        
    if not video_path:
        return jsonify({'error': 'Missing video_path parameter.'}), 400
        
    if not os.path.exists(video_path) or not os.path.isfile(video_path):
        return jsonify({'error': f"Video file not found at path: {video_path}"}), 400

    video_name = os.path.basename(video_path)
    base_name, ext_raw = os.path.splitext(video_name)
    ext = ext_raw.lower().lstrip('.')
    
    unique_base = secure_filename(base_name)
    if not unique_base:
        unique_base = "extracted_audio"
        
    counter = 1
    
    # 1. STREAM COPY EXTRACTION MODE
    if mode == 'copy':
        if ext in ['webm', 'mkv']:
            out_ext = 'webm'
        elif ext in ['mp3', 'wav', 'm4a']:
            out_ext = ext
        else:
            out_ext = 'm4a'
            
        out_filename = f"{unique_base}_extracted.{out_ext}"
        while os.path.exists(os.path.join(app.config['UPLOAD_FOLDER'], out_filename)):
            out_filename = f"{unique_base}_extracted_{counter}.{out_ext}"
            counter += 1
            
        output_path = os.path.join(app.config['UPLOAD_FOLDER'], out_filename)
        cmd = [ffmpeg_cmd, '-y', '-i', video_path, '-vn', '-c:a', 'copy', output_path]
        
        try:
            # Run command natively
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            size_mb = os.path.getsize(output_path) / (1024 * 1024)
            return jsonify({
                'message': 'Audio successfully extracted (Stream Copy)',
                'filename': out_filename,
                'original_size_bytes': os.path.getsize(video_path),
                'audio_size_bytes': os.path.getsize(output_path),
                'size_mb': round(size_mb, 2),
                'mode': 'Stream Copy',
                'logs': result.stderr
            }), 200
        except subprocess.CalledProcessError as e:
            # Fall back to MP3 transcoding if stream copy fails (e.g. invalid container configurations)
            print(f"Native stream copy failed. Error: {e.stderr}. Trying MP3 transcode fallback...")
            
            out_filename = f"{unique_base}_extracted.mp3"
            while os.path.exists(os.path.join(app.config['UPLOAD_FOLDER'], out_filename)):
                out_filename = f"{unique_base}_extracted_{counter}.mp3"
                counter += 1
                
            output_path = os.path.join(app.config['UPLOAD_FOLDER'], out_filename)
            cmd_fallback = [ffmpeg_cmd, '-y', '-i', video_path, '-vn', '-c:a', 'libmp3lame', '-q:a', '4', output_path]
            
            try:
                result_fb = subprocess.run(cmd_fallback, capture_output=True, text=True, check=True)
                size_mb = os.path.getsize(output_path) / (1024 * 1024)
                return jsonify({
                    'message': 'Audio successfully extracted (MP3 Transcode Fallback)',
                    'filename': out_filename,
                    'original_size_bytes': os.path.getsize(video_path),
                    'audio_size_bytes': os.path.getsize(output_path),
                    'size_mb': round(size_mb, 2),
                    'mode': 'Transcode Fallback (MP3)',
                    'logs': f"Stream copy failed:\n{e.stderr}\n\nRunning Transcode:\n{result_fb.stderr}"
                }), 200
            except subprocess.CalledProcessError as e_transcode:
                return jsonify({
                    'error': 'Native extraction failed completely.',
                    'logs': f"Stream copy failed:\n{e.stderr}\n\nTranscode failed:\n{e_transcode.stderr}"
                }), 500
                
    # 2. EXPLICIT TRANSCODE TO MP3
    else:
        out_filename = f"{unique_base}_extracted.mp3"
        while os.path.exists(os.path.join(app.config['UPLOAD_FOLDER'], out_filename)):
            out_filename = f"{unique_base}_extracted_{counter}.mp3"
            counter += 1
            
        output_path = os.path.join(app.config['UPLOAD_FOLDER'], out_filename)
        cmd = [ffmpeg_cmd, '-y', '-i', video_path, '-vn', '-c:a', 'libmp3lame', '-q:a', '4', output_path]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            size_mb = os.path.getsize(output_path) / (1024 * 1024)
            return jsonify({
                'message': 'Audio successfully transcoded to MP3',
                'filename': out_filename,
                'original_size_bytes': os.path.getsize(video_path),
                'audio_size_bytes': os.path.getsize(output_path),
                'size_mb': round(size_mb, 2),
                'mode': 'MP3 Transcode',
                'logs': result.stderr
            }), 200
        except subprocess.CalledProcessError as e:
            return jsonify({
                'error': 'MP3 Transcoding failed.',
                'logs': e.stderr
            }), 500

@app.route('/api/files', methods=['GET'])
def list_files():
    try:
        files = []
        for filename in os.listdir(app.config['UPLOAD_FOLDER']):
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            if os.path.isfile(file_path):
                if filename.endswith('.json'):
                    continue
                size_mb = os.path.getsize(file_path) / (1024 * 1024)
                transcript_name = f"{filename}.json"
                transcript_path = os.path.join(app.config['TRANSCRIPTIONS_FOLDER'], transcript_name)
                has_transcript = os.path.exists(transcript_path)
                files.append({
                    'name': filename,
                    'size': f"{round(size_mb, 2)} MB",
                    'url': f"/uploads/{filename}",
                    'has_transcript': has_transcript
                })
        # Sort files by modification time: latest first
        files.sort(key=lambda x: os.path.getmtime(os.path.join(app.config['UPLOAD_FOLDER'], x['name'])), reverse=True)
        return jsonify(files), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/uploads/<path:filename>')
def download_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

def get_whisper_model(model_size):
    try:
        print(f"Loading WhisperModel '{model_size}' on CUDA...")
        return WhisperModel(model_size, device="cuda", compute_type="float16")
    except Exception as e:
        print(f"CUDA initialization failed or not supported: {e}. Falling back to CPU with int8.")
        return WhisperModel(model_size, device="cpu", compute_type="int8")

@app.route('/api/transcribe', methods=['POST'])
def transcribe_audio():
    modal_url = os.getenv('MODAL_TRANSCRIBE_URL')
    
    data = request.json or {}
    filename = data.get('filename', '')
    model_size = data.get('model_size', 'base')
    
    if not filename:
        return jsonify({'error': 'Missing filename parameter.'}), 400
        
    audio_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(audio_path) or not os.path.isfile(audio_path):
        return jsonify({'error': f"Audio file not found: {filename}"}), 400
        
    transcript_filename = f"{filename}.json"
    transcript_path = os.path.join(app.config['TRANSCRIPTIONS_FOLDER'], transcript_filename)
    
    # Check if we should forward the request to Modal
    use_modal = os.getenv('USE_MODAL', 'true').lower() == 'true' or modal_url
    if use_modal:
        try:
            print(f"Routing transcription for {filename} to Modal via Python SDK...")
            import modal
            
            with open(audio_path, "rb") as f:
                file_bytes = f.read()
                
            print("Looking up WhisperTranscriber Cls...")
            # Use the official Class from_name lookup in Modal
            WhisperTranscriber = modal.Cls.from_name("whisper-transcribe", "WhisperTranscriber")
            server = WhisperTranscriber()
            
            print(f"Calling remote WhisperTranscriber.transcribe method with model_size={model_size}...")
            transcript_data = server.transcribe.remote(audio_bytes=file_bytes, model_name=model_size, language="auto")
            
            with open(transcript_path, 'w', encoding='utf-8') as f:
                json.dump(transcript_data, f, ensure_ascii=False, indent=2)
                
            return jsonify({
                'message': 'Transcription completed successfully via Modal SDK',
                'transcript': transcript_data,
                'transcript_file': transcript_filename
            }), 200
        except Exception as e:
            print(f"Modal native SDK transcription failed: {e}")
            
            # Fall back to HTTP post if they still have the FastAPI endpoint deployed (using their modal_url)
            if modal_url:
                try:
                    # Append query parameters for model and language to modal_url
                    target_url = modal_url
                    delimiter = '&' if '?' in target_url else '?'
                    target_url = f"{target_url}{delimiter}model={model_size}&language=auto"
                    
                    print(f"Falling back to routing to Modal HTTP endpoint: {target_url}")
                    import uuid
                    import urllib.request
                    
                    boundary = f"---Boundary-{uuid.uuid4().hex}"
                    
                    with open(audio_path, "rb") as f:
                        file_bytes = f.read()
                        
                    parts = [
                        f"--{boundary}".encode("utf-8"),
                        f'Content-Disposition: form-data; name="file"; filename="{filename}"'.encode("utf-8"),
                        b"Content-Type: application/octet-stream",
                        b"",
                        file_bytes,
                        f"--{boundary}--".encode("utf-8")
                    ]
                    
                    body = b"\r\n".join(parts)
                    
                    headers = {
                        "Content-Type": f"multipart/form-data; boundary={boundary}",
                        "Content-Length": str(len(body))
                    }
                    
                    req = urllib.request.Request(target_url, data=body, headers=headers, method="POST")
                    with urllib.request.urlopen(req, timeout=600) as response:
                        transcript_data = json.loads(response.read().decode("utf-8"))
                    
                    with open(transcript_path, 'w', encoding='utf-8') as f:
                        json.dump(transcript_data, f, ensure_ascii=False, indent=2)
                        
                    return jsonify({
                        'message': 'Transcription completed successfully via Modal HTTP fallback',
                        'transcript': transcript_data,
                        'transcript_file': transcript_filename
                    }), 200
                except Exception as http_e:
                    print(f"Modal HTTP fallback routing failed: {http_e}")
                    
            if not HAS_FASTER_WHISPER:
                return jsonify({
                    'error': f'Modal transcription failed and local fallback is not available. SDK Error: {str(e)}'
                }), 500
            print("Falling back to local transcription...")

    # Local fallback
    if not HAS_FASTER_WHISPER:
        return jsonify({'error': 'faster-whisper is not installed or available on this server.'}), 500
        
    try:
        model = get_whisper_model(model_size)
        segments, info = model.transcribe(audio_path, beam_size=5, word_timestamps=True)
        
        segments_list = []
        for segment in segments:
            words_list = []
            if segment.words:
                for word in segment.words:
                    words_list.append({
                        'word': word.word,
                        'start': round(word.start, 2),
                        'end': round(word.end, 2),
                        'probability': round(word.probability, 2)
                    })
            segments_list.append({
                'id': segment.id,
                'start': round(segment.start, 2),
                'end': round(segment.end, 2),
                'text': segment.text,
                'words': words_list
            })
            
        transcript_data = {
            'text': ''.join([s['text'] for s in segments_list]).strip(),
            'language': info.language,
            'language_probability': round(info.language_probability, 2),
            'duration': round(info.duration, 2),
            'segments': segments_list
        }
        
        with open(transcript_path, 'w', encoding='utf-8') as f:
            json.dump(transcript_data, f, ensure_ascii=False, indent=2)
            
        return jsonify({
            'message': 'Transcription completed successfully',
            'transcript': transcript_data,
            'transcript_file': transcript_filename
        }), 200
        
    except Exception as e:
        import traceback
        print(f"Whisper transcription failed: {e}\n{traceback.format_exc()}")
        return jsonify({
            'error': 'Whisper transcription failed.',
            'details': str(e)
        }), 500

@app.route('/api/save-transcript', methods=['POST'])
def save_transcript():
    data = request.json or {}
    filename = data.get('filename', '')
    transcript_data = data.get('transcript', {})
    
    if not filename or not transcript_data:
        return jsonify({'error': 'Missing filename or transcript data.'}), 400
        
    try:
        # Create a dummy placeholder in uploads folder so it lists in /api/files
        dummy_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        with open(dummy_path, 'w') as f:
            f.write("")
            
        # Save the transcript JSON
        transcript_filename = f"{filename}.json"
        transcript_path = os.path.join(app.config['TRANSCRIPTIONS_FOLDER'], transcript_filename)
        with open(transcript_path, 'w', encoding='utf-8') as f:
            json.dump(transcript_data, f, ensure_ascii=False, indent=2)
            
        return jsonify({
            'message': 'Transcript saved successfully',
            'filename': filename,
            'transcript_file': transcript_filename
        }), 200
    except Exception as e:
        return jsonify({'error': f"Failed to save transcript: {str(e)}"}), 500

@app.route('/api/transcript/<path:filename>', methods=['GET'])
def get_transcript(filename):
    # Retrieve transcript if it exists
    transcript_filename = f"{filename}.json"
    transcript_path = os.path.join(app.config['TRANSCRIPTIONS_FOLDER'], transcript_filename)
    
    if os.path.exists(transcript_path) and os.path.isfile(transcript_path):
        try:
            with open(transcript_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return jsonify({
                'exists': True,
                'transcript': data
            }), 200
        except Exception as e:
            return jsonify({
                'exists': False,
                'error': f"Failed to load transcript JSON: {str(e)}"
            }), 500
            
    return jsonify({'exists': False}), 200

def split_transcript_into_sentences(transcript_data):
    segments = transcript_data.get('segments', [])
    all_words = []
    for seg in segments:
        for w in seg.get('words', []):
            all_words.append(w)
            
    if not all_words:
        # Fallback to segment-level text if no word-level timestamps exist
        sentences = []
        sentence_id = 0
        for seg in segments:
            text = seg.get('text', '').strip()
            import re
            parts = re.split(r'(?<=[.!?])\s+', text)
            for part in parts:
                if part.strip():
                    sentences.append({
                        'id': sentence_id,
                        'text': part.strip(),
                        'start': seg.get('start', 0.0),
                        'end': seg.get('end', 0.0),
                        'words': []
                    })
                    sentence_id += 1
        return sentences

    sentences = []
    current_words = []
    sentence_id = 0
    
    # Common abbreviations that don't end a sentence
    ABBREVIATIONS = {
        'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'sr.', 'jr.', 'vs.', 'etc.', 
        'eg.', 'ie.', 'a.m.', 'p.m.', 'u.s.', 'u.k.', 'jan.', 'feb.', 
        'mar.', 'apr.', 'jun.', 'jul.', 'aug.', 'sep.', 'oct.', 'nov.', 'dec.'
    }
    
    for w in all_words:
        current_words.append(w)
        word_text = w.get('word', '').strip()
        
        # Determine if this word ends a sentence
        is_sentence_end = False
        
        # Check for sentence-ending punctuation
        if word_text and word_text[-1] in ['.', '?', '!']:
            # Check if it's an abbreviation
            clean_word = word_text.lower()
            if clean_word not in ABBREVIATIONS:
                is_sentence_end = True
            
        if is_sentence_end:
            text_parts = []
            for cw in current_words:
                text_parts.append(cw.get('word', ''))
            sentence_text = "".join(text_parts).strip()
            
            sentences.append({
                'id': sentence_id,
                'text': sentence_text,
                'start': current_words[0].get('start', 0.0),
                'end': current_words[-1].get('end', 0.0),
                'words': [{'word': cw.get('word', '').strip(), 'start': cw.get('start', 0.0), 'end': cw.get('end', 0.0)} for cw in current_words]
            })
            sentence_id += 1
            current_words = []
            
    # Capture any trailing words
    if current_words:
        text_parts = []
        for cw in current_words:
            text_parts.append(cw.get('word', ''))
        sentence_text = "".join(text_parts).strip()
        sentences.append({
            'id': sentence_id,
            'text': sentence_text,
            'start': current_words[0].get('start', 0.0),
            'end': current_words[-1].get('end', 0.0),
            'words': [{'word': cw.get('word', '').strip(), 'start': cw.get('start', 0.0), 'end': cw.get('end', 0.0)} for cw in current_words]
        })
        
    return sentences

@app.route('/chunking')
def chunking_view():
    return render_template('chunking.html')

@app.route('/keypoints')
def keypoints_view():
    return render_template('keypoints.html')

@app.route('/api/generate-session-keypoints', methods=['POST'])
def generate_session_keypoints():
    data = request.json or {}
    sentences = data.get('sentences', [])
    feedback = data.get('feedback', '').strip()
    existing_heading = data.get('existing_heading', '')
    existing_subheadings = data.get('existing_subheadings', [])
    existing_text_content = data.get('existing_text_content', '')
    existing_visuals = data.get('existing_visuals', None)
    model_name = data.get('model', 'google/gemini-2.5-flash')
    
    # Normalize model names to OpenRouter IDs
    if model_name == 'gemini-2.5-flash':
        model_name = 'google/gemini-2.5-flash'
    elif model_name == 'gemini-2.5-pro':
        model_name = 'google/gemini-2.5-pro'
    elif model_name == 'gemini-2.0-flash':
        model_name = 'google/gemini-2.0-flash'
        
    # API key from headers, request body, or environment
    api_key = request.headers.get('X-Gemini-Key') or data.get('api_key') or os.getenv('OPENROUTER_API_KEY') or os.getenv('GEMINI_API_KEY')
    
    if not api_key:
        return jsonify({'error': 'OpenRouter API Key is missing. Please configure OPENROUTER_API_KEY in your .env file.'}), 400
        
    if not sentences:
        return jsonify({'error': 'No sentences provided for generating keypoints.'}), 400
        
    # Construct the session text and timestamped timeline transcript representation
    session_text = " ".join([s.get('text', '') for s in sentences])
    
    timestamped_lines = []
    for s in sentences:
        start_time = s.get('start', 0.0)
        end_time = s.get('end', 0.0)
        words = s.get('words', [])
        if words:
            word_str_list = []
            for w in words:
                w_text = w.get('word', '').strip()
                w_start = w.get('start', 0.0)
                word_str_list.append(f"{w_text}({w_start:.1f}s)")
            words_str = " ".join(word_str_list)
        else:
            words_str = s.get('text', '')
        timestamped_lines.append(f"[{start_time:.1f}s - {end_time:.1f}s]: {words_str}")
        
    timestamped_transcript = "\n".join(timestamped_lines)
    
    session_start = sentences[0].get('start', 0.0) if sentences else 0.0
    session_end = sentences[-1].get('end', 0.0) if sentences else 0.0
    
    # Try reading the reinforced visuals guide
    visuals_guide_content = ""
    try:
        visuals_guide_path = os.path.join(os.path.dirname(__file__), 'markdown_files', 'reinforced_visuals.md')
        if os.path.exists(visuals_guide_path):
            with open(visuals_guide_path, 'r', encoding='utf-8') as f:
                visuals_guide_content = f.read()
        else:
            # Fallback to loading Visuals_guide.md if reinforced_visuals.md doesn't exist yet
            visuals_guide_path_alt = os.path.join(os.path.dirname(__file__), 'markdown_files', 'Visuals_guide.md')
            if os.path.exists(visuals_guide_path_alt):
                with open(visuals_guide_path_alt, 'r', encoding='utf-8') as f:
                    visuals_guide_content = f.read()
    except Exception as e:
        print(f"Error reading visuals guide: {e}")
        
    # Design prompt
    if feedback:
        existing_data = {
            "heading": existing_heading,
            "subheadings": existing_subheadings,
            "text_content": existing_text_content
        }
        if existing_visuals:
            existing_data["visuals"] = existing_visuals
            
        existing_str = json.dumps(existing_data, indent=2)
        
        prompt_tmpl = load_prompt_template('keypoints_refinement.md')
        prompt = prompt_tmpl.format(
            feedback=feedback,
            session_text=session_text,
            timestamped_transcript=timestamped_transcript,
            existing_str=existing_str,
            session_start=session_start,
            session_end=session_end,
            visuals_guide_content=visuals_guide_content
        )
    else:
        prompt_tmpl = load_prompt_template('keypoints_initial.md')
        prompt = prompt_tmpl.format(
            session_text=session_text,
            timestamped_transcript=timestamped_transcript,
            session_start=session_start,
            session_end=session_end,
            visuals_guide_content=visuals_guide_content
        )

    schema = {
        "type": "object",
        "properties": {
            "heading": {"type": "string"},
            "subheadings": {
                "type": "array",
                "items": {"type": "string"}
            },
            "text_content": {"type": "string"},
            "visuals": {
                "type": "object",
                "properties": {
                    "template_name": {"type": "string"},
                    "why_chosen": {"type": "string"},
                    "graphics_required": {"type": "boolean"},
                    "content": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "items": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "value": {"type": "string"},
                                        "timestamp": {"type": "number"}
                                    },
                                    "required": ["value", "timestamp"],
                                    "additionalProperties": False
                                }
                            },
                            "details": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "label": {"type": "string"},
                                        "value": {"type": "string"},
                                        "timestamp": {"type": "number"},
                                        "extra": {"type": "string"}
                                    },
                                    "required": ["label", "value", "timestamp"],
                                    "additionalProperties": False
                                }
                            }
                        },
                        "required": ["title"],
                        "additionalProperties": False
                    }
                },
                "required": ["template_name", "why_chosen", "graphics_required", "content"],
                "additionalProperties": False
            }
        },
        "required": ["heading", "subheadings", "text_content", "visuals"],
        "additionalProperties": False
    }
    
    try:
        text_response = call_openrouter_api(
            model_name=model_name,
            prompt=prompt,
            response_schema=schema,
            api_key=api_key
        )
        
        result = clean_json_response(text_response)
        visuals = result.get('visuals', {})
        template_name = visuals.get('template_name', 'Face Only').strip()
        
        heading = result.get('heading', '')
        subheadings = result.get('subheadings', [])
        text_content = result.get('text_content', '')
        
        if template_name == 'Face Only':
            subheadings = []
            text_content = ''
            visuals['graphics_required'] = False
            visuals['content'] = {'title': '', 'items': [], 'details': []}
            
        return jsonify({
            'heading': heading,
            'subheadings': subheadings,
            'text_content': text_content,
            'visuals': visuals
        }), 200
    except OpenRouterError as e:
        return jsonify({'error': str(e)}), e.status_code
    except Exception as e:
        return jsonify({'error': f"Failed to run keypoints generation: {str(e)}"}), 500


@app.route('/api/sentences/<path:filename>', methods=['GET'])
def get_sentences(filename):
    transcript_filename = f"{filename}.json"
    transcript_path = os.path.join(app.config['TRANSCRIPTIONS_FOLDER'], transcript_filename)
    
    if not os.path.exists(transcript_path) or not os.path.isfile(transcript_path):
        return jsonify({'error': f"Transcript file not found for: {filename}"}), 404
        
    try:
        with open(transcript_path, 'r', encoding='utf-8') as f:
            transcript_data = json.load(f)
            
        sentences = split_transcript_into_sentences(transcript_data)
        return jsonify({
            'filename': filename,
            'duration': transcript_data.get('duration', 0.0),
            'sentences': sentences
        }), 200
    except Exception as e:
        return jsonify({'error': f"Failed to parse sentences: {str(e)}"}), 500

@app.route('/api/chunk-sessions', methods=['POST'])
def chunk_sessions():
    data = request.json or {}
    sentences = data.get('sentences', [])
    model_name = data.get('model', 'google/gemini-2.5-flash')
    single_batch = bool(data.get('single_batch'))
    
    # Normalize model names to OpenRouter IDs
    if model_name == 'gemini-2.5-flash':
        model_name = 'google/gemini-2.5-flash'
    elif model_name == 'gemini-2.5-pro':
        model_name = 'google/gemini-2.5-pro'
    elif model_name == 'gemini-2.0-flash':
        model_name = 'google/gemini-2.0-flash'
        
    # API key from headers, request body, or environment
    api_key = request.headers.get('X-Gemini-Key') or data.get('api_key') or os.getenv('OPENROUTER_API_KEY') or os.getenv('GEMINI_API_KEY')
    
    if not api_key:
        return jsonify({'error': 'OpenRouter API Key is missing. Please configure OPENROUTER_API_KEY in your .env file.'}), 400
        
    if not sentences:
        return jsonify({'error': 'No sentences provided for chunking.'}), 400
        
    # Construct the iterative batching logic
    BATCH_SIZE = 40
    sessions = []
    
    # Helper to chunk a specific batch of sentences using OpenRouter API
    def call_gemini_chunker(batch_sentences):
        sentences_str = ""
        for s in batch_sentences:
            sentences_str += f"[{s['id']}] {s['text']}\n"
            
        first_idx = batch_sentences[0]['id']
        last_idx = batch_sentences[-1]['id']
        
        prompt_tmpl = load_prompt_template('session_chunking.md')
        prompt = prompt_tmpl.replace("{first_index}", str(first_idx)).replace("{last_index}", str(last_idx)).replace("{sentences_str}", sentences_str)
        # Fallback for old templates
        prompt = prompt.replace("from 0 to", f"from {first_idx} to")
        
        schema = {
            "type": "object",
            "properties": {
                "sessions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "summary": {"type": "string"},
                            "sentence_indices": {
                                "type": "array",
                                "items": {"type": "integer"}
                            }
                        },
                        "required": ["title", "summary", "sentence_indices"],
                        "additionalProperties": False
                    }
                }
            },
            "required": ["sessions"],
            "additionalProperties": False
        }
        
        text_response = call_openrouter_api(
            model_name=model_name,
            prompt=prompt,
            response_schema=schema,
            api_key=api_key
        )
        
        res_data = clean_json_response(text_response)
        if isinstance(res_data, dict) and 'sessions' in res_data:
            return res_data['sessions']
        return res_data

    if single_batch:
        try:
            try:
                return jsonify({'sessions': call_gemini_chunker(sentences)}), 200
            except FileNotFoundError as tmpl_err:
                return jsonify({'error': f'Prompt template file missing on server: {str(tmpl_err)}. Make sure the markdown_files/ directory is present.'}), 500
        except OpenRouterError as e:
            return jsonify({'error': str(e)}), e.status_code
        except Exception as e:
            return jsonify({'error': f"Failed to run chunking: {str(e)}"}), 500
        
    i = 0
    total_sentences = len(sentences)
    
    while i < total_sentences:
        current_batch_sentences = sentences[i:i + BATCH_SIZE]
        
        if not sessions:
            # First batch: just chunk the first 40 sentences
            batch_to_chunk = current_batch_sentences
            i += BATCH_SIZE
        else:
            # Bundle the last 2 chunks from the previous batch with the next 40 sentences
            last_chunks_count = min(2, len(sessions))
            last_two_chunks = sessions[-last_chunks_count:]
            
            # Extract sentence indices from those last chunks
            bundled_indices = []
            for chunk in last_two_chunks:
                bundled_indices.extend(chunk.get('sentence_indices', []))
                
            # Get actual sentence dicts for those indices
            bundled_sentences = [s for s in sentences if s['id'] in bundled_indices]
            
            # Combine the last 2 chunks' sentences with the next 40 sentences
            batch_to_chunk = bundled_sentences + current_batch_sentences
            
            # Remove the last chunks from sessions since they are being re-chunked
            sessions = sessions[:-last_chunks_count]
            
            # Advance our pointer
            i += BATCH_SIZE
            
        try:
            try:
                new_sessions = call_gemini_chunker(batch_to_chunk)
            except FileNotFoundError as tmpl_err:
                return jsonify({'error': f'Prompt template file missing on server: {str(tmpl_err)}. Make sure the markdown_files/ directory is present.'}), 500
            sessions.extend(new_sessions)
        except OpenRouterError as e:
            return jsonify({'error': f"OpenRouter Error at sentence index {i - BATCH_SIZE}: {str(e)}"}), e.status_code
        except Exception as e:
            return jsonify({'error': f"Failed to run chunking at sentence index {i - BATCH_SIZE}: {str(e)}"}), 500
            
    return jsonify({'sessions': sessions}), 200

@app.route('/api/chunks/<path:filename>', methods=['GET'])
def get_chunks(filename):
    chunks_filename = f"{filename}_chunks.json"
    chunks_path = os.path.join(app.config['TRANSCRIPTIONS_FOLDER'], chunks_filename)
    
    deleted_filename = f"{filename}_deleted_sentences.json"
    deleted_path = os.path.join(app.config['TRANSCRIPTIONS_FOLDER'], deleted_filename)
    
    deleted_sentences = []
    if os.path.exists(deleted_path) and os.path.isfile(deleted_path):
        try:
            with open(deleted_path, 'r', encoding='utf-8') as f:
                del_data = json.load(f)
                deleted_sentences = del_data.get('deleted_sentences', [])
        except Exception as e:
            print(f"Failed to load deleted sentences: {e}")
    
    if os.path.exists(chunks_path) and os.path.isfile(chunks_path):
        try:
            with open(chunks_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            # Fallback to deleted_sentences inside chunks JSON if separate file doesn't exist
            if not deleted_sentences:
                deleted_sentences = data.get('deleted_sentences', [])
            return jsonify({
                'exists': True,
                'sessions': data.get('sessions', []),
                'deleted_sentences': deleted_sentences,
                'updated_at': data.get('updated_at', '')
            }), 200
        except Exception as e:
            return jsonify({
                'exists': False,
                'error': f"Failed to load chunks: {str(e)}"
            }), 500
            
    return jsonify({'exists': False}), 200

@app.route('/api/save-chunks/<path:filename>', methods=['POST'])
def save_chunks(filename):
    data = request.json or {}
    sessions = data.get('sessions', [])
    deleted_sentences = data.get('deleted_sentences', [])
    
    chunks_filename = f"{filename}_chunks.json"
    chunks_path = os.path.join(app.config['TRANSCRIPTIONS_FOLDER'], chunks_filename)
    
    deleted_filename = f"{filename}_deleted_sentences.json"
    deleted_path = os.path.join(app.config['TRANSCRIPTIONS_FOLDER'], deleted_filename)
    
    try:
        # Check if raw transcript was sent directly (e.g. from serverless Modal flow)
        raw_transcript = data.get('raw_transcript')
        if raw_transcript:
            transcript_filename = f"{filename}.json"
            transcript_path = os.path.join(app.config['TRANSCRIPTIONS_FOLDER'], transcript_filename)
            with open(transcript_path, 'w', encoding='utf-8') as f:
                json.dump(raw_transcript, f, ensure_ascii=False, indent=2)

        import datetime
        save_data = {
            'filename': filename,
            'sessions': sessions,
            'updated_at': datetime.datetime.now().isoformat()
        }
        with open(chunks_path, 'w', encoding='utf-8') as f:
            json.dump(save_data, f, ensure_ascii=False, indent=2)
            
        # Save deleted sentences to a separate dedicated JSON file
        deleted_data = {
            'filename': filename,
            'deleted_sentences': deleted_sentences,
            'updated_at': datetime.datetime.now().isoformat()
        }
        with open(deleted_path, 'w', encoding='utf-8') as f:
            json.dump(deleted_data, f, ensure_ascii=False, indent=2)
            
        return jsonify({
            'message': 'Chunks and deleted sentences saved successfully',
            'filename': chunks_filename
        }), 200
    except Exception as e:
        return jsonify({'error': f"Failed to save chunks: {str(e)}"}), 500

@app.route('/api/export-docx/<path:filename>', methods=['POST'])
def export_docx(filename):
    try:
        import io
        from docx import Document
        from docx.shared import Inches, Pt, RGBColor
        from docx.oxml import OxmlElement, parse_xml
        from docx.oxml.ns import nsdecls, qn
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from flask import send_file
    except ImportError as e:
        return jsonify({'error': f'docx library not installed or import failed: {str(e)}'}), 500
        
    data = request.json or {}
    sessions_data = data.get('sessions', [])
    
    # Pull deleted sentences directly from the separate JSON file on disk
    deleted_sentences = []
    deleted_filename = f"{filename}_deleted_sentences.json"
    deleted_path = os.path.join(app.config['TRANSCRIPTIONS_FOLDER'], deleted_filename)
    if os.path.exists(deleted_path) and os.path.isfile(deleted_path):
        try:
            with open(deleted_path, 'r', encoding='utf-8') as f:
                del_data = json.load(f)
                deleted_sentences = del_data.get('deleted_sentences', [])
        except Exception as e:
            print(f"Error loading deleted sentences from disk during DOCX export: {e}")
            
    # Fallback to payload if file was not found or failed to load
    if not deleted_sentences:
        deleted_sentences = data.get('deleted_sentences', [])
    
    if not sessions_data:
        return jsonify({'error': 'No session data provided for export.'}), 400
        
    # Attempt to load original sentences to construct the transcript text
    transcript_path = os.path.join(app.config['TRANSCRIPTIONS_FOLDER'], f"{filename}.json")
    sentences_map = {}
    if os.path.exists(transcript_path):
        try:
            with open(transcript_path, 'r', encoding='utf-8') as f:
                t_data = json.load(f)
            sentences_list = split_transcript_into_sentences(t_data)
            sentences_map = {s['id']: s for s in sentences_list}
        except Exception as e:
            print(f"Error loading transcript for DOCX: {e}")

    # Helper functions for styling
    def set_cell_background(cell, fill_hex):
        tcPr = cell._tc.get_or_add_tcPr()
        shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
        tcPr.append(shd)

    def set_cell_margins(cell, top=140, bottom=140, left=180, right=180):
        # top, bottom, left, right are in dxa (1 pt = 20 dxa)
        tcPr = cell._tc.get_or_add_tcPr()
        tcMar = OxmlElement('w:tcMar')
        for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
            node = OxmlElement(f'w:{m}')
            node.set(qn('w:w'), str(val))
            node.set(qn('w:type'), 'dxa')
            tcMar.append(node)
        tcPr.append(tcMar)

    def set_cell_borders(cell, color="E2E8F0", sz="4", val="single"):
        tcPr = cell._tc.get_or_add_tcPr()
        tcBorders = OxmlElement('w:tcBorders')
        for border_name in ['top', 'left', 'bottom', 'right']:
            border = OxmlElement(f'w:{border_name}')
            border.set(qn('w:val'), val)
            border.set(qn('w:sz'), sz)
            border.set(qn('w:space'), '0')
            border.set(qn('w:color'), color)
            tcBorders.append(border)
        tcPr.append(tcBorders)

    def format_seconds(seconds):
        mins = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{mins}:{secs:02d}"

    # Create document
    doc = Document()
    
    # Title
    title = doc.add_paragraph()
    title_run = title.add_run("Key Points & Visual Layout Export")
    title_run.font.name = 'Calibri'
    title_run.font.size = Pt(18)
    title_run.font.bold = True
    title_run.font.color.rgb = RGBColor(30, 41, 59) # Slate 800
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    subtitle = doc.add_paragraph()
    subtitle_run = subtitle.add_run(f"Source file: {filename}")
    subtitle_run.font.name = 'Calibri'
    subtitle_run.font.size = Pt(11)
    subtitle_run.font.italic = True
    subtitle_run.font.color.rgb = RGBColor(100, 116, 139) # Slate 500
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    doc.add_paragraph() # Spacer
    
    # Create Table
    table = doc.add_table(rows=1, cols=2)
    table.autofit = False
    
    # Column width setting (in inches)
    col_widths = [Inches(2.6), Inches(3.9)]
    
    # Header Row
    hdr_cells = table.rows[0].cells
    hdr_cells[0].text = ''
    hdr_cells[1].text = ''
    
    # Configure Header Cell 1
    p1 = hdr_cells[0].paragraphs[0]
    p1_run = p1.add_run("Plate & Transcript Content")
    p1_run.font.name = 'Calibri'
    p1_run.font.size = Pt(11)
    p1_run.font.bold = True
    p1_run.font.color.rgb = RGBColor(255, 255, 255)
    
    # Configure Header Cell 2
    p2 = hdr_cells[1].paragraphs[0]
    p2_run = p2.add_run("Curriculum Highlights & Visual Mapping")
    p2_run.font.name = 'Calibri'
    p2_run.font.size = Pt(11)
    p2_run.font.bold = True
    p2_run.font.color.rgb = RGBColor(255, 255, 255)
    
    for i, cell in enumerate(hdr_cells):
        set_cell_background(cell, "1E293B") # Slate 800
        set_cell_margins(cell, top=180, bottom=180, left=180, right=180)
        set_cell_borders(cell, color="475569") # Slate 600
        cell.width = col_widths[i]
        
    # Reconstruct original indices for each session to find original boundaries (including deleted sentences)
    session_original_ranges = []
    session_original_indices = []
    for s in sessions_data:
        session_original_indices.append(list(s.get('sentence_indices', [])))
        
    for ds in deleted_sentences:
        ds_id = ds.get('id')
        if ds_id is None:
            continue
        try:
            ds_id = int(ds_id)
        except ValueError:
            continue
            
        inserted = False
        # 1. Check if it fits inside the active range of any session
        for indices in session_original_indices:
            if indices:
                min_id = min(indices)
                max_id = max(indices)
                if min_id <= ds_id <= max_id:
                    indices.append(ds_id)
                    inserted = True
                    break
                    
        # 2. Check if it is adjacent to any session
        if not inserted:
            for indices in session_original_indices:
                if indices:
                    min_id = min(indices)
                    max_id = max(indices)
                    if ds_id == max_id + 1 or ds_id == min_id - 1:
                        indices.append(ds_id)
                        inserted = True
                        break
                        
        # 3. Fallback to last session
        if not inserted and session_original_indices:
            session_original_indices[-1].append(ds_id)
            
    # Calculate original start and end times for each session
    for indices in session_original_indices:
        indices.sort()
        orig_start = 0.0
        orig_end = 0.0
        if indices and sentences_map:
            first_sent = sentences_map.get(indices[0])
            last_sent = sentences_map.get(indices[-1])
            if first_sent:
                orig_start = first_sent.get('start', 0.0)
            if last_sent:
                orig_end = last_sent.get('end', 0.0)
        session_original_ranges.append((orig_start, orig_end))

    # Populate Rows
    for idx, session in enumerate(sessions_data):
        row = table.add_row()
        row_cells = row.cells
        
        # Widths
        row_cells[0].width = col_widths[0]
        row_cells[1].width = col_widths[1]
        
        # Margins & borders
        for cell in row_cells:
            set_cell_margins(cell, top=140, bottom=140, left=180, right=180)
            set_cell_borders(cell, color="CBD5E1") # Slate 300 (light gray)
            
        # Left Cell Shading (very light blue/gray for Session Column)
        set_cell_background(row_cells[0], "F8FAFC") # Slate 50
        
        # Time duration
        session_start = 0.0
        session_end = 0.0
        indices = session.get('sentence_indices', [])
        if indices and sentences_map:
            first_sent = sentences_map.get(indices[0])
            last_sent = sentences_map.get(indices[-1])
            if first_sent:
                session_start = first_sent.get('start', 0.0)
            if last_sent:
                session_end = last_sent.get('end', 0.0)
        duration_str = f"Time: {format_seconds(session_start)} - {format_seconds(session_end)}"
        
        # Visual Template
        visuals = session.get('visuals', {})
        template_name = visuals.get('template_name', 'Face Only')
        why_chosen = visuals.get('why_chosen', '')
        graphics_req = visuals.get('graphics_required', False)
        v_content = visuals.get('content', {})
        v_title = v_content.get('title', '')
        v_items = v_content.get('items', [])
        v_details = v_content.get('details', [])
        
        # Get first subheading timestamp (defaulting to session_start if none)
        first_sub_ts = None
        if v_items:
            first_sub_ts = v_items[0].get('timestamp')
        if first_sub_ts is None and v_details:
            first_sub_ts = v_details[0].get('timestamp')
            
        if first_sub_ts is None:
            first_sub_ts = session_start
            
        first_sub_ts_str = format_seconds(first_sub_ts)

        # Check for deleted sentences falling within this session's original range
        session_deleted = []
        orig_start, orig_end = session_original_ranges[idx]
        for ds in deleted_sentences:
            ds_start = ds.get('start', 0.0)
            ds_end = ds.get('end', 0.0)
            if orig_start - 0.15 <= ds_start <= orig_end + 0.15:
                session_deleted.append(f"{format_seconds(ds_start)} - {format_seconds(ds_end)}")

        # Left Cell Content
        cell_left = row_cells[0]
        p_session = cell_left.paragraphs[0]
        p_session.paragraph_format.space_after = Pt(4)
        run_s_title = p_session.add_run(f"Plate {idx + 1}")
        run_s_title.font.name = 'Calibri'
        run_s_title.font.size = Pt(11)
        run_s_title.font.bold = True
        run_s_title.font.color.rgb = RGBColor(30, 41, 59) # Slate 800
        
        # Plain text timestamp beside heading
        run_s_ts = p_session.add_run(f" {first_sub_ts_str}")
        run_s_ts.font.name = 'Calibri'
        run_s_ts.font.size = Pt(11)
        run_s_ts.font.bold = False
        run_s_ts.font.color.rgb = RGBColor(30, 41, 59)
        
        if session_deleted:
            run_deleted = p_session.add_run(f" [{', '.join(session_deleted)}]")
            run_deleted.font.name = 'Calibri'
            run_deleted.font.size = Pt(10)
            run_deleted.font.bold = True
            run_deleted.font.color.rgb = RGBColor(220, 38, 38) # Red 600
        
        p_time = cell_left.add_paragraph()
        p_time.paragraph_format.space_after = Pt(8)
        run_time = p_time.add_run(duration_str)
        run_time.font.name = 'Calibri'
        run_time.font.size = Pt(9.5)
        run_time.font.italic = True
        run_time.font.color.rgb = RGBColor(100, 116, 139) # Slate 500
        
        # Transcript Content
        session_sentences = []
        for sid in indices:
            if sid in sentences_map:
                session_sentences.append(sentences_map[sid].get('text', '').strip())
        session_text = " ".join(session_sentences)
        
        p_trans_hdr = cell_left.add_paragraph()
        p_trans_hdr.paragraph_format.space_after = Pt(2)
        run_trans_hdr = p_trans_hdr.add_run("Transcript:")
        run_trans_hdr.font.name = 'Calibri'
        run_trans_hdr.font.size = Pt(9)
        run_trans_hdr.font.bold = True
        run_trans_hdr.font.color.rgb = RGBColor(71, 85, 105) # Slate 600
        
        p_trans_body = cell_left.add_paragraph()
        p_trans_body.paragraph_format.line_spacing = 1.15
        p_trans_body.paragraph_format.space_after = Pt(0)
        run_trans_body = p_trans_body.add_run(session_text or "No transcript text available.")
        run_trans_body.font.name = 'Calibri'
        run_trans_body.font.size = Pt(9.5)
        run_trans_body.font.color.rgb = RGBColor(51, 65, 85) # Slate 700
        
        # Right Cell Content
        cell_right = row_cells[1]
        
        p_temp = cell_right.paragraphs[0]
        p_temp.paragraph_format.space_before = Pt(0)
        p_temp.paragraph_format.space_after = Pt(2)
        run_temp_lbl = p_temp.add_run("Visual Layout Suggestion: ")
        run_temp_lbl.font.name = 'Calibri'
        run_temp_lbl.font.size = Pt(9.5)
        run_temp_lbl.font.bold = True
        run_temp_lbl.font.color.rgb = RGBColor(71, 85, 105) # Slate 600
        
        run_temp_val = p_temp.add_run(template_name)
        run_temp_val.font.name = 'Calibri'
        run_temp_val.font.size = Pt(10)
        run_temp_val.font.bold = True
        run_temp_val.font.color.rgb = RGBColor(13, 148, 136) # Teal 600
        
        if graphics_req:
            run_req = p_temp.add_run(" (Graphics Required)")
            run_req.font.name = 'Calibri'
            run_req.font.size = Pt(9)
            run_req.font.italic = True
            run_req.font.color.rgb = RGBColor(220, 38, 38) # Red 600
            
        if why_chosen:
            p_why = cell_right.add_paragraph()
            p_why.paragraph_format.space_after = Pt(6)
            run_why_lbl = p_why.add_run("Why Chosen: ")
            run_why_lbl.font.name = 'Calibri'
            run_why_lbl.font.size = Pt(9)
            run_why_lbl.font.bold = True
            run_why_lbl.font.color.rgb = RGBColor(100, 116, 139) # Slate 500
            
            run_why_val = p_why.add_run(why_chosen)
            run_why_val.font.name = 'Calibri'
            run_why_val.font.size = Pt(9)
            run_why_val.font.italic = True
            run_why_val.font.color.rgb = RGBColor(71, 85, 105) # Slate 600
            
        # Visual Content details (only if template is not Face Only)
        if template_name == "Name aston":
            aston_name = visuals.get('aston_name', '')
            p_aston = cell_right.add_paragraph()
            p_aston.paragraph_format.space_before = Pt(6)
            p_aston.paragraph_format.space_after = Pt(2)
            run_aston_lbl = p_aston.add_run("Aston Name: ")
            run_aston_lbl.font.name = 'Calibri'
            run_aston_lbl.font.size = Pt(9.5)
            run_aston_lbl.font.bold = True
            run_aston_lbl.font.color.rgb = RGBColor(71, 85, 105) # Slate 600
            
            run_aston_val = p_aston.add_run(aston_name)
            run_aston_val.font.name = 'Calibri'
            run_aston_val.font.size = Pt(10)
            run_aston_val.font.bold = True
            run_aston_val.font.color.rgb = RGBColor(30, 41, 59) # Slate 800
        elif template_name != "Face Only" and (v_title or v_items or v_details):
            p_vc_hdr = cell_right.add_paragraph()
            p_vc_hdr.paragraph_format.space_before = Pt(6)
            p_vc_hdr.paragraph_format.space_after = Pt(2)
            run_vc_hdr = p_vc_hdr.add_run("Visual Content Details:")
            run_vc_hdr.font.name = 'Calibri'
            run_vc_hdr.font.size = Pt(9.5)
            run_vc_hdr.font.bold = True
            run_vc_hdr.font.color.rgb = RGBColor(71, 85, 105) # Slate 600
            
            if v_title:
                p_v_title = cell_right.add_paragraph()
                p_v_title.paragraph_format.space_after = Pt(3)
                run_v_title_lbl = p_v_title.add_run("  Heading: ")
                run_v_title_lbl.font.name = 'Calibri'
                run_v_title_lbl.font.size = Pt(9)
                run_v_title_lbl.font.bold = True
                run_v_title_lbl.font.color.rgb = RGBColor(0, 0, 0)
                
                run_v_title_val = p_v_title.add_run(v_title)
                run_v_title_val.font.name = 'Calibri'
                run_v_title_val.font.size = Pt(9.5)
                run_v_title_val.font.bold = True
                run_v_title_val.font.color.rgb = RGBColor(0, 0, 0)
                
                run_v_title_ts = p_v_title.add_run(f" {first_sub_ts_str}")
                run_v_title_ts.font.name = 'Calibri'
                run_v_title_ts.font.size = Pt(9.5)
                run_v_title_ts.font.bold = False
                run_v_title_ts.font.color.rgb = RGBColor(0, 0, 0)
                
            if v_items:
                for item in v_items:
                    p_v_item = cell_right.add_paragraph(style='List Bullet 2')
                    p_v_item.paragraph_format.space_after = Pt(2)
                    
                    item_val = item.get('value', '')
                    item_ts = item.get('timestamp', 0.0)
                    
                    run_ts = p_v_item.add_run(f"[{format_seconds(item_ts)}] ")
                    run_ts.font.name = 'Calibri'
                    run_ts.font.size = Pt(8.5)
                    run_ts.font.bold = False
                    run_ts.font.color.rgb = RGBColor(0, 0, 0)
                    
                    run_val = p_v_item.add_run(item_val)
                    run_val.font.name = 'Calibri'
                    run_val.font.size = Pt(9)
                    run_val.font.bold = True
                    run_val.font.color.rgb = RGBColor(0, 0, 0)
                    
            if v_details:
                for detail in v_details:
                    p_v_detail = cell_right.add_paragraph(style='List Bullet 2')
                    p_v_detail.paragraph_format.space_after = Pt(2)
                    
                    d_label = detail.get('label', '')
                    d_val = detail.get('value', '')
                    d_ts = detail.get('timestamp', 0.0)
                    
                    run_ts = p_v_detail.add_run(f"[{format_seconds(d_ts)}] ")
                    run_ts.font.name = 'Calibri'
                    run_ts.font.size = Pt(8.5)
                    run_ts.font.bold = False
                    run_ts.font.color.rgb = RGBColor(0, 0, 0)
                    
                    run_lbl = p_v_detail.add_run(f"{d_label}: ")
                    run_lbl.font.name = 'Calibri'
                    run_lbl.font.size = Pt(9)
                    run_lbl.font.bold = True
                    run_lbl.font.color.rgb = RGBColor(0, 0, 0)
                    
                    run_val = p_v_detail.add_run(d_val)
                    run_val.font.name = 'Calibri'
                    run_val.font.size = Pt(9)
                    run_val.font.bold = True
                    run_val.font.color.rgb = RGBColor(0, 0, 0)
                    
        # Additional Text Content is omitted from the DOCX file per user request
            
    # Save to BytesIO
    file_stream = io.BytesIO()
    doc.save(file_stream)
    file_stream.seek(0)
    
    # Return as download attachment
    base_name, _ = os.path.splitext(os.path.basename(filename))
    export_filename = f"{base_name}_curriculum_export.docx"
    
    return send_file(
        file_stream,
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        as_attachment=True,
        download_name=export_filename
    )

if __name__ == '__main__':
    # Disable reloader and debug mode to prevent background process crashes in Google Colab
    app.run(debug=False, host='0.0.0.0', port=5000)
