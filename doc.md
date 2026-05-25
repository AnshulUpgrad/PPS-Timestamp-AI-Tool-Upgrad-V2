# Project Documentation: AuraExtract

AuraExtract is a local developer/user utility built in Python (Flask) and Vanilla JS/CSS that extracts audio tracks from video files on the client's device and transcribes the speech locally using `faster-whisper`, yielding interactive word-level timestamps.

---

## 📂 Project Structure

```text
Heading_Matcher_v2/
├── app.py                  # Flask server, native OS dialog helpers, and transcription API
├── requirements.txt        # Python package dependencies
├── templates/
│   └── index.html          # Clean, premium, non-technical dashboard layout
├── static/
│   ├── css/
│   │   └── style.css       # Design variables, UI styling, and transcription highlights
│   └── js/
│       └── app.js          # Core frontend controller (pipeline orchestration & player sync)
├── uploads/                # Directory containing extracted audio files and local transcripts (*.json)
└── doc.md                  # This developer documentation file
```

---

## ⚙️ Backend Architecture (`app.py`)

The backend is built using Flask, running locally on port `5000`.

### Core Features
1. **Native OS File Selector**: Uses a native Python Tkinter script executed via subprocess (`/api/select-file`) to open the native OS file explorer, avoiding security restrictions of web-browser directory traversal.
2. **FFmpeg Subprocess Extraction**: Natively extracts audio from selected videos.
   * *Mode 1 (Original Quality)*: Fast stream-copying (saves as `.m4a` or `.webm` depending on container codec).
   * *Mode 2 (MP3 Format)*: Transcodes the audio stream to MP3.
3. **Local Whisper Transcription**: Utilizes `faster-whisper` for fast inference using CTranslate2.
   * Automatically attempts to run on GPU via CUDA (using `float16` quantization) and falls back gracefully to CPU (using optimized `int8` quantization) if CUDA runtime DLLs are missing.
   * Transcribes audio with `word_timestamps=True` to extract millisecond word ranges.
   * Saves transcripts locally as `<filename>.json` in the `uploads/` folder.

### API Endpoints
* `POST /api/select-file`: Triggers native Windows file dialog to select a video.
* `POST /api/extract`: Runs FFmpeg subprocess to extract audio.
* `POST /api/transcribe`: Triggers local Whisper model transcription on a specific audio file.
* `GET /api/transcript/<filename>`: Retrieves the saved transcript JSON.
* `GET /api/files`: Returns lists of all extracted audio files (and check whether `<audio_file>.json` transcript exists).
* `GET /api/settings` & `POST /api/settings`: Validates and saves custom FFmpeg paths in `config.json`.

---

## 🎨 Frontend Architecture

The frontend is implemented with a premium glassmorphic theme designed for non-technical users (FFmpeg paths, command line logging, and Whisper model names are abstracted/hidden by default).

### Core Features
1. **Automated Pipeline Flow**:
   * Selection -> Preparing workspace -> Extracting audio -> Converting speech to text -> Refreshing Library.
   * Once transcription completes, the audio library renders the audio item with an interactive transcript.
2. **Interactive Audio Transcript Sync**:
   * Listens to the `<audio>` player's `timeupdate` event.
   * Highlights the current segment (`.active-segment`) and the current word (`.active-word`) in real-time.
   * Word-span elements have tooltips detailing exact timestamp boundaries on hover.
   * Automatically scrolls the active word into view within the scrollbox container.
3. **Click-to-Seek Playback**:
   * Clicking any word span in the transcript updates the player's `currentTime` to the word's `start` time and initiates playback.
4. **Keyword Filter**:
   * Typing in the search input highlights matches in the transcript using a `.search-match` highlight.
5. **Manual Transcribe Option**:
   * For existing audio files in the library that do not have transcripts, users can select an accuracy model (Fast, Balanced, High) and trigger transcription on-demand.

---

## 🚀 How to Run Locally

1. Open PowerShell or Command Prompt in the project directory.
2. Activate the virtual environment:
   ```powershell
   .\venv\Scripts\activate
   ```
3. Install dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
4. Run the Flask application:
   ```powershell
   python app.py
   ```
5. Open your browser and go to **[http://127.0.0.1:5000](http://127.0.0.1:5000)**.
