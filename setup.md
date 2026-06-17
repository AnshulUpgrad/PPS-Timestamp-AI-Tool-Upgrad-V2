# Setup & Deployment Guide

This guide walks you through setting up a new instance of the **Heading Matcher (V2)** application. The application architecture consists of two main parts:
1. **Serverless Transcription Service**: Deployed on [Modal](https://modal.com) using `faster-whisper` running on an NVIDIA T4 GPU.
2. **Flask Web Application**: The frontend and orchestration backend, which calls Modal for transcription and OpenRouter (Gemini) for chunking and keypoint extraction.

---

## Prerequisites

Before starting, ensure you have:
- **Python 3.10 or 3.11** installed.
- A **Modal Account** ([Sign up at modal.com](https://modal.com/)).
- An **OpenRouter API Key** (or direct Gemini API Key) to run smart chunking.

---

## Part 1: Deploy the Transcription Service on Modal

The transcription service runs serverless on Modal's GPU infrastructure. It handles heavy Whisper speech-to-text processing on-demand.

### 1. Install Modal CLI
Ensure you are in a clean terminal environment or your virtual environment, and install the Modal Python package:
```bash
pip install modal
```

### 2. Authenticate with Modal
Run the authentication command to link your local machine to your Modal account:
```bash
modal setup
```
This will open a browser window asking you to authorize the Modal CLI.

> [!NOTE]
> If you are setting this up in a headless CI/CD environment or server, you can configure your credentials via environment variables instead by creating an **API Token** in your Modal dashboard (Settings -> API Tokens):
> - `MODAL_TOKEN_ID`
> - `MODAL_TOKEN_SECRET`

### 3. Deploy the Modal App
Navigate to the root directory containing `transcribe_modal.py` and run:
```bash
modal deploy transcribe_modal.py
```

Upon successful deployment, Modal will build the container image (installing `ffmpeg`, Python dependencies, and caching the Whisper models), register the Python class, and expose a FastAPI web server.

Look at the console output. You will see:
- A registered class name: `whisper-transcribe`
- A deployed web endpoint URL:
  ```text
  Created fastapi_app => https://<your-modal-username>--whisper-transcribe-fastapi-app.modal.run
  ```

Copy this URL as you will need it for the Flask application configuration.

---

## Part 2: Configure the Flask Application

### 1. Create a `.env` File
In the project root, copy the provided `.env.example` file to `.env`:
```bash
cp .env.example .env
```

### 2. Update Environment Variables
Open the `.env` file and fill in your keys:
```env
# OpenRouter API Key for Gemini models (Smart Chunking & Refinements)
OPENROUTER_API_KEY=your_actual_open_router_api_key_here

# The FastAPI URL copied from your Modal deployment output (with /transcribe path appended)
MODAL_TRANSCRIBE_URL=https://<your-modal-username>--whisper-transcribe-fastapi-app.modal.run/transcribe
```

---

## Part 3: Run the Application Locally

### 1. Create and Activate a Virtual Environment
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python -m venv venv
source venv/bin/activate
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Start the Flask Server
```bash
python app.py
```
By default, the server runs on `http://localhost:5000`. Open this address in your web browser.

---

## Part 4: Production Deployment (Vercel, Render, etc.)

### Hosting the Web App on Vercel
Vercel is ideal for serverless web applications. However, serverless platforms have a **4.5MB request payload limit** and a **10-second request timeout**.

To bypass these limitations:
- When the application detects it is running in a serverless Vercel environment, it automatically switches to **Direct Upload Mode** (client-side upload).
- The web browser uploads media files directly to the `MODAL_TRANSCRIBE_URL` endpoint using standard Multipart Form-data.
- Ensure that the environment variable `MODAL_TRANSCRIBE_URL` is set in your Vercel Dashboard project settings.

### Hosting the Web App on Render or VPS
If deploying to a persistent server (like Render's paid tier or a VPS):
- Set your `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` in your environment variables.
- The Flask backend will use the **Modal Python SDK** to communicate natively with Modal via `modal.Cls.from_name("whisper-transcribe", "WhisperTranscriber")` to run speech-to-text securely.

---

## Troubleshooting

### 1. Modal Cold Starts
On the first upload of the day or after long periods of inactivity, transcription might take an extra 30–60 seconds. This is because Modal is spinning up a new NVIDIA T4 GPU container (a "cold start"). Subsequent transcriptions will execute almost instantly.

### 2. CORS Issues
If you encounter CORS issues when uploading files directly from the browser to Modal on Vercel, check `transcribe_modal.py` to ensure `CORSMiddleware` is configured correctly:
```python
web_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
If you change `transcribe_modal.py`, redeploy it using `modal deploy transcribe_modal.py`.
