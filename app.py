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

# Configure directories
UPLOAD_FOLDER = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'uploads')
CONFIG_FILE = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'config.json')

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Configuration Helpers
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

@app.route('/api/select-file', methods=['POST'])
def select_file():
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
            'path': selected_path,
            'name': name,
            'size': f"{round(size_mb, 2)} MB",
            'size_bytes': size_bytes
        }), 200
    return jsonify({'path': ''}), 200

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
                        'end': seg.get('end', 0.0)
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
                'end': current_words[-1].get('end', 0.0)
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
            'end': current_words[-1].get('end', 0.0)
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
    model_name = data.get('model', 'gemini-2.5-flash')
    
    # API key from headers, request body, or environment
    api_key = request.headers.get('X-Gemini-Key') or data.get('api_key') or os.getenv('GEMINI_API_KEY')
    
    if not api_key:
        return jsonify({'error': 'Gemini API Key is missing. Please configure GEMINI_API_KEY in your .env file.'}), 400
        
    if not sentences:
        return jsonify({'error': 'No sentences provided for generating keypoints.'}), 400
        
    # Construct the session text
    session_text = " ".join([s.get('text', '') for s in sentences])
    
    # Design prompt
    if feedback:
        existing_str = json.dumps({
            "heading": existing_heading,
            "subheadings": existing_subheadings
        }, indent=2)
        
        prompt = f"""You are an expert curriculum designer, LMS architect, and instructional editor.
Your task is to refine the heading and subheadings for a session of transcription text based on user feedback: "{feedback}".

Here is the transcription text of the session:
\"\"\"
{session_text}
\"\"\"

Here is the existing structure:
{existing_str}

Please refine the heading and subheadings according to the feedback, adhering strictly to the guidelines below.

GUIDELINES FOR HEADINGS & SUBHEADINGS:
1. Heading: Represents "What category of learning are we inside?" (the main instructional unit title).
   - Must be declarative and concept-centric (focused on stable academic concepts, frameworks, principles, categories, methods, theories).
   - Do NOT make it conversational (e.g. Avoid "Now we will talk about testing", Use "Types of Psychological Tests").
   - Do NOT focus on speaker personality, examples, or anecdotes.
2. Subheadings: Define "What specific competencies/concepts belong to this category?"
   - Must be competency-oriented, focusing on learner outcomes, and typically start with instructional design verbs (e.g. Explain, Differentiate, Describe, Recognize, Identify, Compare, Apply, Analyze).
   - MUST BE EXTREMELY CONCISE: Exactly 4 or 5 words maximum per subheading. Must be a short set of words highlighting what is spoken about, NOT verbose/long sentences.
   - Example of a bad verbose subheading: "Explain the difference between standardized psychological tests and developmental assessment methods." (12 words - too long!)
   - Example of a good short subheading: "Differentiate Types of Psychological Tests" (5 words - concise, Bloom's Taxonomy verb, accurate!)
   - Do NOT exceed 5 words under any circumstances.
3. Tone: Professional, curriculum-oriented, instructional. Convert temporal spoken content into structured educational knowledge architecture.
"""
    else:
        prompt = f"""You are an expert curriculum designer, LMS architect, and instructional editor.
Your task is to analyze the transcription text of a session and convert it into structured educational knowledge architecture by generating exactly ONE main heading and a list of subheadings (key highlights).

Here is the transcription text of the session:
\"\"\"
{session_text}
\"\"\"

Please generate:
1. A single declarative, concept-centric main heading.
2. A list of 2 to 5 competency-oriented subheadings summarizing the key concepts, competencies, or details taught.

Adhere strictly to the guidelines below:

GUIDELINES FOR HEADINGS & SUBHEADINGS:
1. Heading: Represents "What category of learning are we inside?" (the main instructional unit title).
   - Must be declarative and concept-centric (focused on stable academic concepts, frameworks, principles, categories, methods, theories).
   - Do NOT make it conversational (e.g. Avoid "Now we will talk about testing", Use "Types of Psychological Tests").
   - Do NOT focus on speaker personality, examples, or anecdotes.
2. Subheadings: Define "What specific competencies/concepts belong to this category?"
   - Must be competency-oriented, focusing on learner outcomes, and typically start with instructional design verbs (e.g. Explain, Differentiate, Describe, Recognize, Identify, Compare, Apply, Analyze).
   - MUST BE EXTREMELY CONCISE: Exactly 4 or 5 words maximum per subheading. Must be a short set of words highlighting what is spoken about, NOT verbose/long sentences.
   - Example of a bad verbose subheading: "Explain the difference between standardized psychological tests and developmental assessment methods." (12 words - too long!)
   - Example of a good short subheading: "Differentiate Types of Psychological Tests" (5 words - concise, Bloom's Taxonomy verb, accurate!)
   - Do NOT exceed 5 words under any circumstances.
3. Tone: Professional, curriculum-oriented, instructional. Convert temporal spoken content into structured educational knowledge architecture.
"""

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
                    }
                },
                "required": ["heading", "subheadings"]
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
        return jsonify({
            'heading': result.get('heading', ''),
            'subheadings': result.get('subheadings', [])
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
    prompt = f"""You are an AI assistant that partitions a sequence of transcription sentences into logical, coherent topical sessions (chapters).
Each session must contain approximately 4 to 5 sentences.
You must respect the original chronological order of the sentences. Do not reorder them, skip any, or duplicate them. Every sentence index from 0 to {len(sentences)-1} must belong to exactly one session, and the indices within and across sessions must be strictly sequential (e.g. Session 1: [0, 1, 2, 3], Session 2: [4, 5, 6, 7, 8], etc.).

For each session, construct:
1. A concise, professional title.
2. A single-sentence summary of the content.
3. The list of sentence indices belonging to that session.

Here are the sentences to partition:
{sentences_str}
"""
    
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

if __name__ == '__main__':
    app.run(debug=True, port=5000)
