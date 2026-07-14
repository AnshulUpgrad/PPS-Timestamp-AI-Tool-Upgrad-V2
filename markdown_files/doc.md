# PPSimplify Developer Guide

PPSimplify is a Flask and Vanilla JavaScript application that converts media into timestamped curriculum content. It extracts audio with FFmpeg, transcribes speech through Modal-hosted `faster-whisper`, groups the transcript into topical sessions through OpenRouter, and generates editable curriculum highlights and visual-template mappings.

GPT-5.6 Luna (`openai/gpt-5.6-luna`) is the default OpenRouter model. Existing Gemini options remain available as fallbacks.

## Project Structure

```text
Heading_Matcher_v2/
|-- app.py                         Flask routes, persistence, AI orchestration, DOCX export
|-- templates.json                Canonical visual-template catalog and constraints
|-- transcribe_modal.py            Modal T4 GPU transcription service
|-- requirements.txt               Flask application dependencies
|-- setup.md                       Local and deployment setup guide
|-- templates/
|   |-- index.html                 Media-processing dashboard
|   |-- chunking.html              Topical session editor
|   `-- keypoints.html             Curriculum and visual-mapping editor
|-- static/
|   |-- css/style.css              Shared application design system
|   `-- js/
|       |-- app.js                 Upload, extraction, transcription, and playback
|       |-- chunking.js            Session grouping and manual corrections
|       `-- keypoints.js           Keypoint generation, template editing, and exports
|-- markdown_files/
|   |-- session_chunking.md        Session grouping prompt
|   |-- keypoints_initial.md       Initial curriculum-generation prompt
|   `-- keypoints_refinement.md    Feedback-driven refinement prompt
`-- tests/test_app_integration.py  Offline integration regression suite
```

## Processing Flow

1. The user selects or uploads a media file.
2. FFmpeg stream-copies or transcodes its audio track.
3. The Flask application calls Modal through the SDK, then the HTTP endpoint if necessary. A locally installed `faster-whisper` is the final optional fallback.
4. Whisper returns segment and word timestamps, stored as `transcriptions/<filename>.json`.
5. The application reconstructs timestamped sentences from word punctuation.
6. OpenRouter groups sentences into topical sessions. Batching and reconciliation preserve chronological order and assign each sentence exactly once.
7. GPT-5.6 Luna generates curriculum headings and visual mappings constrained by `templates.json`.
8. Users refine the sessions and visual content before exporting JSON or DOCX.

## Canonical Template Catalog

`templates.json` is the only maintained template catalog. The backend validates it, `/api/templates` exposes it to the browser, the Key Points dropdown is built from it, and the complete catalog is injected into keypoint prompts. Template identifiers are constrained through the OpenRouter JSON schema, so generated `template_name` values must exactly match catalog keys.

Manual-only `Name aston` and `Custom Template` options remain available in the editor but are not AI-generated catalog values.

## Configuration

```env
OPENROUTER_API_KEY=sk-or-your-key
OPENROUTER_MODEL=openai/gpt-5.6-luna
MODAL_TRANSCRIBE_URL=https://your-modal-endpoint/transcribe
```

`OPENROUTER_MODEL` is optional. When omitted, the application defaults to `openai/gpt-5.6-luna`. `GEMINI_API_KEY` and the legacy `X-Gemini-Key` request header remain supported for backward compatibility, but new clients use `OPENROUTER_API_KEY` and `X-OpenRouter-Key`.

## Persistence

The server uses filesystem JSON rather than a database:

- `uploads/<filename>` stores extracted or uploaded audio.
- `transcriptions/<filename>.json` stores the raw transcript.
- `transcriptions/<filename>_chunks.json` stores sessions, keypoints, and visuals.
- `transcriptions/<filename>_deleted_sentences.json` stores removed transcript sentences.
- `config.json` stores the optional FFmpeg path.

The browser mirrors transcripts, chunks, deleted sentences, and its processed-file registry in `localStorage`. This provides continuity in stateless environments such as Vercel.

## Important API Routes

- `GET /api/config`: client environment and default AI model.
- `GET /api/templates`: canonical template catalog and identifiers.
- `POST /api/chunk-sessions`: schema-validated topical grouping.
- `POST /api/generate-session-keypoints`: curriculum and visual-template generation.
- `POST /api/validate-key`: OpenRouter credential validation.
- `POST /api/save-chunks/<filename>`: session and keypoint persistence.
- `POST /api/export-docx/<filename>`: timestamp-aware curriculum export.

## Verification

The regression suite mocks OpenRouter and consumes no API credits:

```powershell
python -m unittest discover -s tests -v
```

JavaScript syntax can be checked with:

```powershell
node --check static/js/app.js
node --check static/js/chunking.js
node --check static/js/keypoints.js
```

Live OpenRouter and Modal calls require valid credentials and are intentionally outside the offline regression suite.
