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

# Detect Google Colab environment (checks if Google Drive is mounted or if Colab packages exist)
IS_COLAB = os.path.exists('/content/drive') or 'google.colab' in sys.modules or os.environ.get('IS_COLAB') == 'true'

# Use local uploads folder for all environments (no Google Drive dependency)
UPLOAD_FOLDER = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'uploads')
CONFIG_FILE = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'config.json')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Configuration Helpers
def load_prompt_template(filename):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(base_dir, 'markdown_files', filename)
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

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
        'is_colab': IS_COLAB
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
    title="Select Video File",
    filetypes=[("Video Files", "*.mp4 *.webm *.mov *.avi *.mkv *.m4v"), ("All Files", "*.*")]
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
                transcript_path = os.path.join(app.config['UPLOAD_FOLDER'], transcript_name)
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
    if not HAS_FASTER_WHISPER:
        return jsonify({'error': 'faster-whisper is not installed or available on this server.'}), 500
        
    data = request.json or {}
    filename = data.get('filename', '')
    model_size = data.get('model_size', 'base')
    
    if not filename:
        return jsonify({'error': 'Missing filename parameter.'}), 400
        
    audio_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(audio_path) or not os.path.isfile(audio_path):
        return jsonify({'error': f"Audio file not found: {filename}"}), 400
        
    transcript_filename = f"{filename}.json"
    transcript_path = os.path.join(app.config['UPLOAD_FOLDER'], transcript_filename)
    
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

@app.route('/api/transcript/<path:filename>', methods=['GET'])
def get_transcript(filename):
    # Retrieve transcript if it exists
    transcript_filename = f"{filename}.json"
    transcript_path = os.path.join(app.config['UPLOAD_FOLDER'], transcript_filename)
    
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
    model_name = data.get('model', 'gemini-2.5-flash')
    
    # API key from headers, request body, or environment
    api_key = request.headers.get('X-Gemini-Key') or data.get('api_key') or os.getenv('GEMINI_API_KEY')
    
    if not api_key:
        return jsonify({'error': 'Gemini API Key is missing. Please configure GEMINI_API_KEY in your .env file.'}), 400
        
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
        visuals_guide_path = os.path.join(os.path.dirname(__file__), 'reinforced_visuals.md')
        if os.path.exists(visuals_guide_path):
            with open(visuals_guide_path, 'r', encoding='utf-8') as f:
                visuals_guide_content = f.read()
        else:
            # Fallback to loading Visuals_guide.md if reinforced_visuals.md doesn't exist yet
            visuals_guide_path_alt = os.path.join(os.path.dirname(__file__), 'Visuals_guide.md')
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

    import urllib.request
    import urllib.error
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
    
    headers = {
        'Content-Type': 'application/json'
    }
    
    body = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {
                    "heading": {"type": "STRING"},
                    "subheadings": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"}
                    },
                    "text_content": {"type": "STRING"},
                    "visuals": {
                        "type": "OBJECT",
                        "properties": {
                            "template_name": {"type": "STRING"},
                            "why_chosen": {"type": "STRING"},
                            "graphics_required": {"type": "BOOLEAN"},
                            "content": {
                                "type": "OBJECT",
                                "properties": {
                                    "title": {"type": "STRING"},
                                    "items": {
                                        "type": "ARRAY",
                                        "items": {
                                            "type": "OBJECT",
                                            "properties": {
                                                "value": {"type": "STRING"},
                                                "timestamp": {"type": "NUMBER"}
                                            },
                                            "required": ["value", "timestamp"]
                                        }
                                    },
                                    "details": {
                                        "type": "ARRAY",
                                        "items": {
                                            "type": "OBJECT",
                                            "properties": {
                                                "label": {"type": "STRING"},
                                                "value": {"type": "STRING"},
                                                "timestamp": {"type": "NUMBER"},
                                                "extra": {"type": "STRING"}
                                            },
                                            "required": ["label", "value", "timestamp"]
                                        }
                                    }
                                },
                                "required": ["title"]
                            }
                        },
                        "required": ["template_name", "why_chosen", "graphics_required", "content"]
                    }
                },
                "required": ["heading", "subheadings", "text_content", "visuals"]
            }
        }
    }
    
    try:
        req = urllib.request.Request(url, data=json.dumps(body).encode('utf-8'), headers=headers, method='POST')
        with urllib.request.urlopen(req, timeout=60) as response:
            response_data = json.loads(response.read().decode('utf-8'))
            
        candidates = response_data.get('candidates', [])
        if not candidates:
            return jsonify({'error': 'No response candidates received from Gemini API.', 'details': response_data}), 500
            
        text_response = candidates[0].get('content', {}).get('parts', [{}])[0].get('text', '')
        if not text_response:
            return jsonify({'error': 'Empty response from Gemini API.', 'details': response_data}), 500
            
        result = json.loads(text_response.strip())
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
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        try:
            error_json = json.loads(error_body)
            error_msg = error_json.get('error', {}).get('message', str(e))
        except Exception:
            error_msg = error_body or str(e)
        return jsonify({'error': f"Gemini API HTTP Error: {error_msg}"}), e.code
    except Exception as e:
        return jsonify({'error': f"Failed to run Gemini keypoints generation: {str(e)}"}), 500


@app.route('/api/sentences/<path:filename>', methods=['GET'])
def get_sentences(filename):
    transcript_filename = f"{filename}.json"
    transcript_path = os.path.join(app.config['UPLOAD_FOLDER'], transcript_filename)
    
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
    model_name = data.get('model', 'gemini-2.5-flash')
    
    # API key from headers, request body, or environment
    api_key = request.headers.get('X-Gemini-Key') or data.get('api_key') or os.getenv('GEMINI_API_KEY')
    
    if not api_key:
        return jsonify({'error': 'Gemini API Key is missing. Please configure GEMINI_API_KEY in your .env file.'}), 400
        
    if not sentences:
        return jsonify({'error': 'No sentences provided for chunking.'}), 400
        
    # Construct the sentences payload for prompt
    sentences_str = ""
    for s in sentences:
        sentences_str += f"[{s['id']}] {s['text']}\n"
        
    # Design prompt
    prompt_tmpl = load_prompt_template('session_chunking.md')
    prompt = prompt_tmpl.format(
        last_index=len(sentences) - 1,
        sentences_str=sentences_str
    )
    
    import urllib.request
    import urllib.error
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
    
    headers = {
        'Content-Type': 'application/json'
    }
    
    body = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "title": {"type": "STRING"},
                        "summary": {"type": "STRING"},
                        "sentence_indices": {
                            "type": "ARRAY",
                            "items": {"type": "INTEGER"}
                        }
                    },
                    "required": ["title", "summary", "sentence_indices"]
                }
            }
        }
    }
    
    try:
        req = urllib.request.Request(url, data=json.dumps(body).encode('utf-8'), headers=headers, method='POST')
        with urllib.request.urlopen(req, timeout=60) as response:
            response_data = json.loads(response.read().decode('utf-8'))
            
        candidates = response_data.get('candidates', [])
        if not candidates:
            return jsonify({'error': 'No response candidates received from Gemini API.', 'details': response_data}), 500
            
        text_response = candidates[0].get('content', {}).get('parts', [{}])[0].get('text', '')
        if not text_response:
            return jsonify({'error': 'Empty response from Gemini API.', 'details': response_data}), 500
            
        sessions = json.loads(text_response.strip())
        return jsonify({'sessions': sessions}), 200
        
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        try:
            error_json = json.loads(error_body)
            error_msg = error_json.get('error', {}).get('message', str(e))
        except Exception:
            error_msg = error_body or str(e)
        return jsonify({'error': f"Gemini API HTTP Error: {error_msg}"}), e.code
    except Exception as e:
        return jsonify({'error': f"Failed to run Gemini chunking: {str(e)}"}), 500

@app.route('/api/chunks/<path:filename>', methods=['GET'])
def get_chunks(filename):
    chunks_filename = f"{filename}_chunks.json"
    chunks_path = os.path.join(app.config['UPLOAD_FOLDER'], chunks_filename)
    
    if os.path.exists(chunks_path) and os.path.isfile(chunks_path):
        try:
            with open(chunks_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return jsonify({
                'exists': True,
                'sessions': data.get('sessions', []),
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
    
    chunks_filename = f"{filename}_chunks.json"
    chunks_path = os.path.join(app.config['UPLOAD_FOLDER'], chunks_filename)
    
    try:
        import datetime
        save_data = {
            'filename': filename,
            'sessions': sessions,
            'updated_at': datetime.datetime.now().isoformat()
        }
        with open(chunks_path, 'w', encoding='utf-8') as f:
            json.dump(save_data, f, ensure_ascii=False, indent=2)
            
        return jsonify({
            'message': 'Chunks saved successfully',
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
    
    if not sessions_data:
        return jsonify({'error': 'No session data provided for export.'}), 400
        
    # Attempt to load original sentences to construct the transcript text
    transcript_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{filename}.json")
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
        return f"{mins:02d}:{secs:02d}"

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
        
        # Left Cell Content
        cell_left = row_cells[0]
        p_session = cell_left.paragraphs[0]
        p_session.paragraph_format.space_after = Pt(4)
        run_s_title = p_session.add_run(f"Plate {idx + 1}")
        run_s_title.font.name = 'Calibri'
        run_s_title.font.size = Pt(11)
        run_s_title.font.bold = True
        run_s_title.font.color.rgb = RGBColor(30, 41, 59) # Slate 800
        
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
        
        # Visual Template
        visuals = session.get('visuals', {})
        template_name = visuals.get('template_name', 'Face Only')
        why_chosen = visuals.get('why_chosen', '')
        graphics_req = visuals.get('graphics_required', False)
        v_content = visuals.get('content', {})
        v_title = v_content.get('title', '')
        v_items = v_content.get('items', [])
        v_details = v_content.get('details', [])
        
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
        if template_name != "Face Only" and (v_title or v_items or v_details):
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
                
            if v_items:
                for item in v_items:
                    p_v_item = cell_right.add_paragraph(style='List Bullet 2')
                    p_v_item.paragraph_format.space_after = Pt(2)
                    
                    item_val = item.get('value', '')
                    item_ts = item.get('timestamp', 0.0)
                    
                    run_ts = p_v_item.add_run(f"[{format_seconds(item_ts)}] ")
                    run_ts.font.name = 'Calibri'
                    run_ts.font.size = Pt(8.5)
                    run_ts.font.bold = True
                    run_ts.font.color.rgb = RGBColor(0, 0, 0)
                    
                    run_val = p_v_item.add_run(item_val)
                    run_val.font.name = 'Calibri'
                    run_val.font.size = Pt(9)
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
                    run_ts.font.bold = True
                    run_ts.font.color.rgb = RGBColor(0, 0, 0)
                    
                    run_lbl = p_v_detail.add_run(f"{d_label}: ")
                    run_lbl.font.name = 'Calibri'
                    run_lbl.font.size = Pt(9)
                    run_lbl.font.bold = True
                    run_lbl.font.color.rgb = RGBColor(0, 0, 0)
                    
                    run_val = p_v_detail.add_run(d_val)
                    run_val.font.name = 'Calibri'
                    run_val.font.size = Pt(9)
                    run_val.font.color.rgb = RGBColor(0, 0, 0)
                    
        # Additional Text Content
        text_content = session.get('text_content', '')
        if text_content:
            p_add_hdr = cell_right.add_paragraph()
            p_add_hdr.paragraph_format.space_before = Pt(8)
            p_add_hdr.paragraph_format.space_after = Pt(2)
            run_add_hdr = p_add_hdr.add_run("Additional Content / Notes:")
            run_add_hdr.font.name = 'Calibri'
            run_add_hdr.font.size = Pt(9.5)
            run_add_hdr.font.bold = True
            run_add_hdr.font.color.rgb = RGBColor(71, 85, 105) # Slate 600
            
            p_add_body = cell_right.add_paragraph()
            p_add_body.paragraph_format.line_spacing = 1.15
            p_add_body.paragraph_format.space_after = Pt(0)
            run_add_body = p_add_body.add_run(text_content)
            run_add_body.font.name = 'Calibri'
            run_add_body.font.size = Pt(9)
            run_add_body.font.color.rgb = RGBColor(51, 65, 85) # Slate 700
            
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

