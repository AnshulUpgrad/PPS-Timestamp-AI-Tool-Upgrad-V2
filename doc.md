# Project Documentation: PPSimplify

PPSimplify is a local developer/user utility built in Python (Flask) and Vanilla JS/CSS that extracts audio tracks from video files on the client's device and transcribes the speech locally using `faster-whisper`, yielding interactive word-level timestamps. It also contains a Smart Chunker module to segment speech transcripts into topical sessions using Gemini AI.

---

## 📂 Project Structure

```text
Heading_Matcher_v2/
├── app.py                  # Flask server, native OS dialog helpers, transcription, and chunking APIs
├── requirements.txt        # Python package dependencies
├── .env.example            # Template configuration for environment variables
├── .env                    # Local environment variables containing Gemini API keys (git ignored)
├── templates/
│   ├── index.html          # Clean, premium, non-technical dashboard layout
│   └── chunking.html       # Visual workspace for editing transcript chapters/sessions
├── static/
│   ├── css/
│   │   └── style.css       # Design variables, UI styling, and layout coordinates
│   └── js/
│       ├── app.js          # Core frontend controller (pipeline orchestration & player sync)
│       └── chunking.js     # Chunker state engine, shift boundaries, and Gemini calls
├── uploads/                # Directory containing extracted audio files, transcripts (*.json), and session files (*_chunks.json)
└── doc.md                  # This developer documentation file
```

---

## ⚙️ Backend Architecture (`app.py`)

The backend is built using Flask, running locally on port `5000`.

### Core Features
1. **Environment Configuration**: Utilizes `python-dotenv` to load the `GEMINI_API_KEY` from a local `.env` configuration file.
2. **Native OS File Selector**: Uses a native Python Tkinter script executed via subprocess (`/api/select-file`) to open the native OS file explorer, avoiding security restrictions of web-browser directory traversal.
3. **FFmpeg Subprocess Extraction**: Natively extracts audio from selected videos.
   * *Mode 1 (Original Quality)*: Fast stream-copying (saves as `.m4a` or `.webm` depending on container codec).
   * *Mode 2 (MP3 Format)*: Transcodes the audio stream to MP3.
4. **Local Whisper Transcription**: Utilizes `faster-whisper` for fast inference using CTranslate2.
   * Transcribes audio with `word_timestamps=True` to extract millisecond word ranges.
   * Saves transcripts locally as `<filename>.json` in the `uploads/` folder.
5. **Sentence-Level Splitting Helper**: Reconstructs complete sentence blocks from Whisper word arrays using punctuation-based regex splits (`.`, `?`, `!`), automatically ignoring common abbreviations (like `Mr.`, `Dr.`, `vs.`, `segment 2`, etc.). It maps the sentence `start` time to the first word's start, and `end` time to the last word's end.
6. **Gemini Structured Grouping**: Connects to the Gemini API (`gemini-2.5-flash` or `gemini-2.0-flash`) using strict JSON schemas (`responseMimeType: "application/json"`) to partition sentence lists into topical chapters (each containing roughly 4-5 sentences).

### API Endpoints
* `POST /api/select-file`: Triggers native Windows file dialog to select a video.
* `POST /api/extract`: Runs FFmpeg subprocess to extract audio.
* `POST /api/transcribe`: Triggers local Whisper model transcription on a specific audio file.
* `GET /api/transcript/<filename>`: Retrieves the saved transcript JSON.
* `GET /api/files`: Returns lists of all extracted audio files (and checks whether `<audio_file>.json` transcript exists).
* `GET /api/settings` & `POST /api/settings`: Validates and saves custom FFmpeg paths in `config.json`.
* `GET /chunking`: Renders the new Smart Chunker page template.
* `GET /api/sentences/<filename>`: Extracts and parses sentence subchunks from Whisper transcripts.
* `POST /api/chunk-sessions`: Accepts sentences list, prompts Gemini API with JSON schema structure, and returns grouped session arrays.
* `GET /api/chunks/<filename>` & `POST /api/save-chunks/<filename>`: Handles local persistence for the session chunk JSON configurations (`<filename>_chunks.json`).

---

## 🎨 Frontend Architecture

The frontend is implemented with a premium glassmorphic theme designed for non-technical users.

### Core Features
1. **Automated Pipeline Flow**:
   * Selection -> Preparing workspace -> Extracting audio -> Converting speech to text -> Refreshing Library.
2. **Interactive Audio Transcript Sync (Dashboard)**:
   * Listens to the `<audio>` player's `timeupdate` event.
   * Highlights the current segment and current word in real-time, scrolling the active text into view.
3. **Click-to-Seek Playback**:
   * Clicking any word span updates the player's `currentTime` to the word's `start` time and initiates playback.
4. **Smart Chunker Workspace**:
   * Displays the audio player alongside a vertical list of parsed sentences (subchunks).
   * Displays grouped sessions as cards containing editable titles and summaries.
   * **Boundary Shift Operations**: Boundary sentences (the first sentence of session $i$ or the last sentence of session $i$) can be shifted to adjacent sessions using simple arrow buttons, dynamically modifying lists and instantly updating session start/end times.
   * **Manual Structural Alterations**: Allows users to split sessions at any sentence ("Split Here" icon on hover) or combine sessions ("Merge with Next" icon in headers).
   * **Playback Syncing**: Playback highlights the active sentence in both columns and seeks to start times on session click.
   * **Exporting**: Allows immediate local browser download of session configurations as structured JSON files.

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
4. Configure your Gemini API Key:
   * Copy `.env.example` to `.env`.
   * Open `.env` and set your key: `GEMINI_API_KEY=AIzaSy...`
5. Run the Flask application:
   ```powershell
   python app.py
   ```
6. Open your browser and go to **[http://127.0.0.1:5000](http://127.0.0.1:5000)**.
