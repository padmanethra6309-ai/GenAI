# Gen AI Content Assistant
## Technology Stack

### Overview

The application is a lightweight web app built with browser-based frontend technologies, a Python Flask backend, and locally hosted AI models through Ollama.

### Frontend

- **HTML** structures the pages and forms.
- **CSS** styles the interface and responsive layouts.
- **Vanilla JavaScript** handles navigation, chat, content transformations, charts, and browser storage.
- **SVG and CSS charts** display activity trends and content distribution. No charting framework is used.

### Backend

- **Python** runs the server-side application.
- **Flask** serves the pages and provides the application API routes.
- **Flask-CORS** manages cross-origin requests.
- **python-dotenv** loads environment configuration.
- **Werkzeug** provides password hashing and supports Flask's session handling.

### AI services

- **Ollama** runs the language models locally.
- The **OpenAI Python SDK** connects to Ollama's OpenAI-compatible local endpoint; Ollama ignores the placeholder API key.
- Quiz generation and assistant chat default to `llama3.2:latest`.
- Image and video analysis default to `llama3.2-vision:latest`; audio transcription defaults to `lfm3-audio:2b`. These require their corresponding Ollama models to be installed.
- The endpoint and model names can be changed with `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_VISION_MODEL`, and `OLLAMA_AUDIO_MODEL`.

### Data storage

- The app does not currently use a database server.
- User account records are stored in the local `users.json` file. Passwords are stored as hashes.
- Transformation history, drafts, and download counts are stored in the browser's `localStorage` for each signed-in username.
- Login state is maintained with Flask's signed session cookie.

### File processing and browser features

- **pypdf** extracts text from PDF files.
- **python-docx** reads DOCX documents.
- **FFmpeg**, with **imageio-ffmpeg** as an optional bundled helper, processes video files and extracts audio or frames.
- The browser's **Speech Synthesis API** reads translated text aloud.

### Configuration

The Ollama endpoint, model names, and administrative credentials are configured in `app.py` and through environment variables. Ollama must be running locally with the required models available. The `OPENAI_API_KEY` entry in `.env` is not used by this Ollama configuration.
