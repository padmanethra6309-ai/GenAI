
import json
import os
import base64
import mimetypes
import shutil
import subprocess
import sys
import tempfile
from io import BytesIO
from pathlib import Path
from functools import wraps
from werkzeug.security import check_password_hash, generate_password_hash
from flask import Flask, request, jsonify, session, send_from_directory, redirect, url_for
from flask_cors import CORS
from dotenv import load_dotenv
from openai import APIError, OpenAI

# Use Ollama's local OpenAI-compatible API. Its compatibility endpoint requires
# an API key value, but Ollama ignores it; OPENAI_API_KEY is not used here.
load_dotenv()
client = OpenAI(
    base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1/"),
    api_key="ollama",
    timeout=180.0,
)
MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:latest")
VISION_MODEL = os.getenv("OLLAMA_VISION_MODEL", "llama3.2-vision:latest")
AUDIO_MODEL = os.getenv("OLLAMA_AUDIO_MODEL", "lfm3-audio:2b")
VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"}


def ollama_failure(error):
    """Return a safe, actionable message for a failed local Ollama request."""
    status = getattr(error, "status_code", None)
    app.logger.error(
        "Ollama request failed: exception=%s status=%s model=%s",
        type(error).__name__, status, MODEL,
    )
    if type(error).__name__ in {"APIConnectionError", "APITimeoutError"}:
        message = "The app could not reach Ollama at localhost:11434. Start Ollama and confirm OLLAMA_BASE_URL is correct."
    elif status == 404:
        message = f"Ollama does not have model '{MODEL}'. Run 'ollama pull {MODEL}' or set OLLAMA_MODEL to an installed model."
    elif status == 400:
        message = f"Ollama rejected the request for model '{MODEL}'. Check the model and request format in the Flask console."
    elif status == 500:
        message = f"Ollama failed while running model '{MODEL}'. Check the Ollama console and available memory, then retry."
    else:
        message = "The Ollama request failed. Check the Flask and Ollama consoles for details, then verify the local model is available."

    return jsonify({"error": message}), 502

app = Flask(__name__)
CORS(app)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "local-development-secret-change-me")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin@12")
USERS_FILE = Path(__file__).with_name("users.json")


def load_users():
    try:
        with USERS_FILE.open("r", encoding="utf-8") as user_file:
            users = json.load(user_file)
            return users if isinstance(users, dict) else {}
    except FileNotFoundError:
        return {}
    except (json.JSONDecodeError, OSError):
        app.logger.exception("Could not read users file")
        return {}


def save_users(users):
    temporary_file = USERS_FILE.with_suffix(".tmp")
    with temporary_file.open("w", encoding="utf-8") as user_file:
        json.dump(users, user_file, indent=2)
    temporary_file.replace(USERS_FILE)


def current_user():
    return {"username": session["username"], "role": session["role"]}


def login_required(admin=False):
    def decorator(function):
        @wraps(function)
        def wrapped(*args, **kwargs):
            if "username" not in session:
                return jsonify({"error": "Authentication required"}), 401
            if admin and session.get("role") != "admin":
                return jsonify({"error": "Admin access required"}), 403
            return function(*args, **kwargs)
        return wrapped
    return decorator


@app.route("/api/session")
def get_session():
    if "username" not in session:
        return jsonify({"error": "Authentication required"}), 401
    return jsonify({"user": current_user()})


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or request.form
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    if not username or not 1 <= len(password) <= 8:
        return jsonify({"error": "Enter a username and a password of up to 8 characters."}), 400

    if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
        role = "admin"
    else:
        user_record = load_users().get(username)
        if not user_record or not check_password_hash(user_record["password_hash"], password):
            return jsonify({"error": "Invalid username or password."}), 401
        role = "user"

    session.clear()
    session["username"] = username
    session["role"] = role
    return jsonify({"user": current_user()})


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Signed out."})


@app.route("/api/users", methods=["POST"])
@login_required(admin=True)
def create_user():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    if not 3 <= len(username) <= 32:
        return jsonify({"error": "Username must be 3 to 32 characters."}), 400
    if not 1 <= len(password) <= 8:
        return jsonify({"error": "Password must be between 1 and 8 characters."}), 400
    if username == ADMIN_USERNAME:
        return jsonify({"error": "That username is reserved for the admin account."}), 400

    users = load_users()
    if username in users:
        return jsonify({"error": "That username already exists."}), 409
    users[username] = {"password_hash": generate_password_hash(password)}
    try:
        save_users(users)
    except OSError:
        app.logger.exception("Could not save new user")
        return jsonify({"error": "Could not save the user account."}), 500
    return jsonify({"message": f"User '{username}' was created."}), 201

@app.route("/")
def home():
	if "password" in request.args or "username" in request.args:
		return redirect(url_for("home"))
	response = send_from_directory(app.root_path, "index.html")
	response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
	return response


@app.route("/quiz-preview")
def quiz_preview():
    return send_from_directory(app.root_path, "quiz-preview.html")


@app.route("/style.css")
def stylesheet():
    return send_from_directory(app.root_path, "style.css")


@app.route("/script.js")
def frontend_script():
	response = send_from_directory(app.root_path, "script.js")
	response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
	return response

@app.route("/transform", methods=["POST"])
@login_required()
def transform():

    try:
        data = request.get_json()

        text = data.get("text", "")
        option = data.get("option", "")
        system_instruction = None

        if not text.strip():
            return jsonify({"error": "Please enter some text"}), 400

        instructions = {
            "summary": "Summarize the following content clearly and concisely.",
            "simple": "Rewrite the following content in simple English.",
            "professional": "Rewrite the following content in professional language.",
            "impressive": "Rewrite the following content to be compelling, memorable, and polished while preserving its meaning and avoiding unsupported claims.",
            "bullets": "Convert the following content into meaningful bullet points.",
            "blog_outline": "Create a clear, useful blog post outline from the supplied content, with a compelling title, an introduction idea, descriptive section headings, and a conclusion.",
            "blog_intro": "Write an engaging, polished introduction for a blog post based only on the supplied content. Establish the topic and why it matters without inventing facts.",
            "blog_article": "Turn the supplied content into a well-structured, readable blog article with a title, introduction, descriptive headings, and conclusion. Preserve factual accuracy and do not invent details.",
            "blog_seo": "Rewrite the supplied content as a clear, search-friendly blog post. Use a natural title and descriptive headings, and preserve meaning without keyword stuffing or unsupported claims.",
            "marketing_copy": "Turn the supplied content into concise, persuasive marketing copy for its intended audience. Highlight supported benefits and include a clear value proposition without inventing claims.",
            "ad_copy": "Create concise, attention-grabbing advertising copy from the supplied content, with a strong headline and a clear call to action. Do not invent product claims.",
            "product_description": "Write a clear, appealing product description based only on the supplied content. Highlight its supported features and benefits in customer-friendly language.",
            "email_campaign": "Write a polished marketing email based on the supplied content, with a subject line, concise body, and clear call to action. Do not invent claims."
        }

        if option == "social":
            platforms = {"LinkedIn", "Instagram", "X", "Facebook", "TikTok", "YouTube", "Threads", "Pinterest", "Other"}
            tones = {"friendly", "professional", "inspirational", "witty", "casual", "educational", "persuasive"}
            formats = {"post", "caption", "thread", "video_script", "carousel"}
            lengths = {"concise", "balanced", "detailed"}
            platform = data.get("platform", "LinkedIn")
            tone = data.get("tone", "friendly")
            content_format = data.get("format", "post")
            length = data.get("length", "balanced")
            audience = data.get("audience", "")
            if (platform not in platforms or tone not in tones or content_format not in formats
                    or length not in lengths or not isinstance(audience, str) or len(audience) > 100):
                return jsonify({"error": "Choose supported social post settings."}), 400
            hashtags = data.get("include_hashtags", True) is True
            call_to_action = data.get("include_cta", True) is True
            emojis = data.get("include_emoji", False) is True
            format_guidance = {
                "post": "Write one standard post.",
                "caption": "Write a short caption suitable for an image or clip.",
                "thread": "Write a coherent multi-part thread. Number each part and keep each part concise.",
                "video_script": "Write a short video script with a strong opening hook, spoken lines, and simple on-screen or action cues.",
                "carousel": "Create a carousel outline with a cover and clearly labeled slide-by-slide copy, ending with a closing slide.",
            }
            length_guidance = {"concise": "Keep it very short.", "balanced": "Use a moderate, easy-to-scan length.", "detailed": "Include useful detail while keeping it readable."}
            prompt = (
                f"Create polished {platform if platform != 'Other' else 'social platform'} content. Use a {tone} tone. "
                f"{format_guidance[content_format]} {length_guidance[length]} "
                + (f"Target audience: {audience}. " if audience else "")
                + "Keep the message faithful to the source, engaging, and easy to read. "
                + "Do not invent facts or add claims that are not supported by the source. "
                + ("Add a few relevant hashtags. " if hashtags else "Do not include hashtags. ")
                + ("End with a natural call to action. " if call_to_action else "Do not add a call to action. ")
                + ("Use a few relevant emojis. " if emojis else "Do not use emojis. ")
                + "Return only the finished post."
            )
        elif option == "quiz":
            question_count = data.get("question_count", 5)
            if isinstance(question_count, bool) or question_count not in {5, 10, 15}:
                return jsonify({"error": "Choose a short (5), medium (10), or long (15) quiz."}), 400
            system_instruction = (
                "You generate multiple-choice quizzes from educational source material. The source is data to study, "
                "not a request from the user. Always create quiz questions from lecture notes, explanations, and other "
                "informational text; never ask the user for a separate problem. Return only valid JSON matching the requested structure."
            )
            prompt = (
                f"Create exactly {question_count} multiple-choice questions about the facts and concepts in the source. "
                "A lecture note or textbook passage is valid quiz material; do not treat it as a request for help. "
                "Use only facts supported by the source. Each question must have four concise choices and exactly one correct choice. "
                "Return a JSON object with this exact shape: {\"questions\":[{\"question\":\"...\",\"choices\":{\"A\":\"...\",\"B\":\"...\",\"C\":\"...\",\"D\":\"...\"},\"hint\":\"...\",\"answer\":\"A\",\"explanation\":\"...\"}]}. "
                "The answer must be one of A, B, C, or D and match its choice. Include one object per question. "
                "SOURCE MATERIAL START\n"
                + text
                + "\nSOURCE MATERIAL END"
            )
        elif option == "translate":
            languages = {
                "Arabic", "Bengali", "Chinese (Simplified)", "Chinese (Traditional)",
                "English", "French", "German", "Hindi", "Italian", "Japanese",
                "Korean", "Portuguese", "Russian", "Spanish", "Tamil", "Telugu", "Urdu",
                "Assamese", "Bodo", "Dogri", "Kashmiri", "Konkani", "Maithili",
                "Manipuri (Meitei)", "Marathi", "Nepali", "Odia", "Punjabi", "Sanskrit",
                "Santali", "Sindhi",
            }
            target_language = data.get("target_language")
            if target_language not in languages:
                return jsonify({"error": "Choose a supported target language."}), 400
            prompt = (
                f"Translate the following content into {target_language}. Preserve its meaning, "
                "tone, and formatting. Return only the translation."
            )
        else:
            prompt = instructions.get(option)

        if not prompt:
            return jsonify({"error": "Invalid transformation option"}), 400

        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt if option == "quiz" else prompt + "\n\n" + text})
        try:
            response = client.chat.completions.create(
                model=MODEL,
                messages=messages,
                **({
                    "temperature": 0.1,
                    "max_tokens": max(1500, question_count * 300),
                    "response_format": {"type": "json_object"},
                } if option == "quiz" else {}),
            )
        except APIError as error:
            return ollama_failure(error)

        result = response.choices[0].message.content or ""

        if option == "quiz":
            try:
                quiz_data = json.loads(result)
                questions = quiz_data.get("questions") if isinstance(quiz_data, dict) else None
                if not isinstance(questions, list) or len(questions) != question_count:
                    raise ValueError("wrong question count")
                normalized = []
                for number, item in enumerate(questions, start=1):
                    if not isinstance(item, dict):
                        raise ValueError("invalid question")
                    question = item.get("question")
                    choices = item.get("choices")
                    answer = item.get("answer")
                    hint = item.get("hint", "")
                    explanation = item.get("explanation", "")
                    if (not isinstance(question, str) or not question.strip()
                            or not isinstance(choices, dict)
                            or any(not isinstance(choices.get(letter), str) or not choices[letter].strip() for letter in "ABCD")
                            or answer not in ("A", "B", "C", "D")
                            or not isinstance(hint, str)
                            or not isinstance(explanation, str)):
                        raise ValueError("invalid question fields")
                    normalized.extend([
                        f"Question {number}: {question.strip()}",
                        *(f"{letter}) {choices[letter].strip()}" for letter in "ABCD"),
                        f"Hint: {hint.strip() or 'Recall the key idea from the source.'}",
                        "",
                    ])
                    if number == 1:
                        answer_lines = []
                    answer_lines.append(f"{number}. {answer} - {explanation.strip() or 'This is the correct answer.'}")
                result = "\n".join(normalized + ["Answer Key", *answer_lines])
            except (ValueError, TypeError, json.JSONDecodeError):
                return jsonify({"error": "The AI could not generate a valid quiz from this source. Please retry or use more detailed source text."}), 502

        return jsonify({"result": result})

    except Exception as e:
        app.logger.exception("Unexpected transformation error (%s)", type(e).__name__)
        return jsonify({"error": "The transformation failed unexpectedly. Check the Flask console for details."}), 500


@app.route("/api/chat", methods=["POST"])
@login_required()
def chat():
    data = request.get_json(silent=True) or {}
    message = data.get("message", "")
    history = data.get("history", [])
    if not isinstance(message, str) or not message.strip() or len(message) > 2000:
        return jsonify({"error": "Enter a question under 2,000 characters."}), 400
    if not isinstance(history, list):
        return jsonify({"error": "Chat history is invalid."}), 400

    messages = [{
        "role": "system",
        "content": (
            "You are the AI Agent in ContentFlow, a helpful general-purpose assistant. "
            "Answer the user's questions clearly and conversationally. Help with general knowledge, "
            "ideas, explanations, and writing. If you are unsure, say so. Keep answers focused and useful."
        ),
    }]
    for item in history[-12:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = item.get("content")
        if role in {"user", "assistant"} and isinstance(content, str) and content.strip():
            messages.append({"role": role, "content": content[:4000]})
    messages.append({"role": "user", "content": message.strip()})

    try:
        response = client.chat.completions.create(model=MODEL, messages=messages)
        answer = response.choices[0].message.content or ""
        return jsonify({"answer": answer})
    except APIError as error:
        return ollama_failure(error)
    except Exception:
        app.logger.exception("AI Agent chat request failed")
        return jsonify({"error": "The AI Agent could not answer right now. Check that Ollama is running."}), 500


@app.errorhandler(413)
def upload_too_large(_error):
    return jsonify({"error": "File is too large. Maximum upload size is 20 MB."}), 413


@app.route("/api/extract", methods=["POST"])
@login_required()
def extract_file():
    uploaded = request.files.get("file")
    if not uploaded or not uploaded.filename:
        return jsonify({"error": "Choose a file to upload."}), 400

    extension = Path(uploaded.filename).suffix.lower()
    file_bytes = uploaded.read()
    if not file_bytes:
        return jsonify({"error": "The selected file is empty."}), 400

    try:
        if extension in {".txt", ".md", ".csv"}:
            extracted = file_bytes.decode("utf-8-sig", errors="replace")
        elif extension == ".pdf":
            try:
                from pypdf import PdfReader
            except ImportError:
                project_venv = Path(__file__).resolve().parent / ".venv"
                package_paths = [project_venv / "Lib" / "site-packages"]
                package_paths.extend((project_venv / "lib").glob("python*/site-packages"))
                for package_path in package_paths:
                    if package_path.is_dir() and str(package_path) not in sys.path:
                        sys.path.insert(0, str(package_path))
                try:
                    from pypdf import PdfReader
                except ImportError:
                    return jsonify({"error": "PDF support is unavailable in this app environment. Install pypdf from requirements.txt, then restart the app."}), 500
            reader = PdfReader(BytesIO(file_bytes))
            if reader.is_encrypted:
                return jsonify({"error": "This PDF is password-protected. Upload an unlocked PDF."}), 400
            extracted = "\n\n".join(page.extract_text() or "" for page in reader.pages)
        elif extension == ".docx":
            try:
                from docx import Document
            except ImportError:
                return jsonify({"error": "Word document support is not installed. Install the packages in requirements.txt and restart the app."}), 500
            document = Document(BytesIO(file_bytes))
            parts = [paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()]
            for table in document.tables:
                parts.extend(" | ".join(cell.text.strip() for cell in row.cells) for row in table.rows)
            extracted = "\n".join(parts)
        elif extension in {".png", ".jpg", ".jpeg", ".webp"}:
            content_type = mimetypes.guess_type(uploaded.filename)[0] or "image/jpeg"
            image_data = base64.b64encode(file_bytes).decode("ascii")
            response = client.chat.completions.create(
                model=VISION_MODEL,
                messages=[{"role": "user", "content": [
                    {"type": "text", "text": "Extract all readable text from this image. If it contains no readable text, briefly describe its visible contents. Return only the extracted text or description."},
                    {"type": "image_url", "image_url": {"url": f"data:{content_type};base64,{image_data}"}},
                ]}],
            )
            extracted = response.choices[0].message.content or ""
        elif extension == ".wav":
            transcription = client.audio.transcriptions.create(
                model=AUDIO_MODEL,
                file=(uploaded.filename, BytesIO(file_bytes), "audio/wav"),
            )
            extracted = transcription.text or ""
        elif extension in VIDEO_EXTENSIONS:
            ffmpeg = shutil.which(os.getenv("FFMPEG_BINARY", "ffmpeg"))
            if not ffmpeg:
                try:
                    import imageio_ffmpeg
                    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
                except ImportError:
                    return jsonify({"error": "Video input needs FFmpeg. Install the app packages with 'pip install -r requirements.txt' (includes the FFmpeg helper), or install FFmpeg and add it to PATH."}), 503

            with tempfile.TemporaryDirectory(prefix="contentflow-video-") as temp_dir:
                video_path = Path(temp_dir) / ("source" + extension)
                video_path.write_bytes(file_bytes)
                parts = []

                # Make a compact contact sheet of sampled frames for visual text/context.
                try:
                    frames = subprocess.run(
                        [ffmpeg, "-hide_banner", "-loglevel", "error", "-i", str(video_path),
                         "-vf", "fps=1/10,scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2,tile=2x4:padding=10:margin=10",
                         "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"],
                        capture_output=True, timeout=180, check=False,
                    )
                    if frames.returncode == 0 and frames.stdout:
                        frame_data = base64.b64encode(frames.stdout).decode("ascii")
                        vision = client.chat.completions.create(
                            model=VISION_MODEL,
                            messages=[{"role": "user", "content": [
                                {"type": "text", "text": "Describe the important visible content in this contact sheet of sampled video frames. Transcribe readable on-screen text when possible. Keep it concise and do not infer details that are not visible."},
                                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{frame_data}"}},
                            ]}],
                        )
                        visual_text = vision.choices[0].message.content or ""
                        if visual_text.strip():
                            parts.append("Video visuals:\n" + visual_text.strip())
                except subprocess.TimeoutExpired:
                    app.logger.warning("Timed out extracting frames from video %s", uploaded.filename)
                except Exception:
                    app.logger.exception("Could not analyze video frames from %s", uploaded.filename)

                # Extract mono speech audio as WAV for the configured local transcription model.
                try:
                    audio = subprocess.run(
                        [ffmpeg, "-hide_banner", "-loglevel", "error", "-i", str(video_path), "-t", "600",
                         "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", "pipe:1"],
                        capture_output=True, timeout=240, check=False,
                    )
                    if audio.returncode == 0 and audio.stdout:
                        transcription = client.audio.transcriptions.create(
                            model=AUDIO_MODEL,
                            file=("video-audio.wav", BytesIO(audio.stdout), "audio/wav"),
                        )
                        spoken_text = transcription.text or ""
                        if spoken_text.strip():
                            parts.insert(0, "Video speech:\n" + spoken_text.strip())
                except subprocess.TimeoutExpired:
                    app.logger.warning("Timed out extracting audio from video %s", uploaded.filename)
                except Exception:
                    app.logger.exception("Could not transcribe video audio from %s", uploaded.filename)

                extracted = "\n\n".join(parts)
        else:
            return jsonify({"error": "Unsupported file type. Upload PNG, JPG, WEBP, MP4, MOV, WEBM, MKV, AVI, M4V, PDF, DOCX, TXT, MD, CSV, or WAV."}), 400

        extracted = extracted.strip()
        if not extracted:
            return jsonify({"error": "No text could be extracted from this file."}), 422
        if len(extracted) > 80000:
            extracted = extracted[:80000]
        return jsonify({"text": extracted})
    except Exception:
        app.logger.exception("Could not extract uploaded file %s", uploaded.filename)
        if extension in {".png", ".jpg", ".jpeg", ".webp"}:
            return jsonify({"error": f"Image extraction failed using Ollama vision model '{VISION_MODEL}'. Install it with 'ollama pull {VISION_MODEL}' and retry."}), 503
        if extension == ".wav":
            return jsonify({"error": f"Audio transcription failed using Ollama audio model '{AUDIO_MODEL}'. Install a compatible model and check OLLAMA_AUDIO_MODEL."}), 503
        if extension in VIDEO_EXTENSIONS:
            return jsonify({"error": f"Could not analyze this video. Check the file and install the Ollama vision/audio models configured as '{VISION_MODEL}' and '{AUDIO_MODEL}'."}), 503
        return jsonify({"error": "Could not read this file. Check that it is a valid, supported document."}), 400


if __name__ == "__main__":
    app.run(debug=True)
