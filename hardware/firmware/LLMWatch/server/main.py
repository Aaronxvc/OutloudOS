# ----------------------------
# Imports
# ----------------------------

# Core FastAPI framework (like ASP.NET Core in C#).
# Used to define the web app and register routes.
from fastapi import FastAPI, UploadFile, File, Form

# Redirect helper (so hitting "/" in a browser jumps to Swagger docs).
# C# tether: similar to ASP.NET Core's Redirect("/docs").
from fastapi.responses import RedirectResponse

# Strongly typed request models (validation + parsing).
# C# tether: record classes with DataAnnotations.
from pydantic import BaseModel

# Utilities for time + file system work.
# C# tether: DateTime.UtcNow, System.IO.Path, etc.
from datetime import datetime
from pathlib import Path

# Run external binaries (whisper.cpp / llama.cpp).
# C# tether: System.Diagnostics.Process.
import subprocess, os, json, tempfile, shutil


# ----------------------------
# App setup
# ----------------------------

# Create the FastAPI app object.
# `title` shows in Swagger UI.
app = FastAPI(title="LLMWatch Journaling Server", version="0.1.0")


# Redirect root ("/") to the Swagger docs UI at /docs.
# include_in_schema=False hides it from the OpenAPI spec.
@app.get("/", include_in_schema=False)
def root_redirect():
    return RedirectResponse(url="/docs")


# ----------------------------
# Data storage
# ----------------------------

# Folder where we keep journal entries.
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# Append-only JSON Lines file. Each request → 1 JSON line.
JOURNAL = DATA_DIR / "journal.jsonl"


# ----------------------------
# Helper models + functions
# ----------------------------

class JournalItem(BaseModel):
    """
    Request body schema for /journal endpoint.
    - text: journal text
    - source: who/what wrote it ("manual", "watch", "stt")
    - tags: optional tags
    """
    text: str
    source: str = "manual"
    tags: list[str] = []


def iso_utc() -> str:
    """Return current UTC time in ISO-8601 format. (C# tether: DateTime.UtcNow.ToString("o"))."""
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def append_journal(item: dict) -> dict:
    """
    Append an entry to journal.jsonl and return it.
    - Each entry is a JSON object with a timestamp.
    """
    item["ts"] = iso_utc()
    with JOURNAL.open("a", encoding="utf-8") as f:
        f.write(json.dumps(item, ensure_ascii=False) + "\n")
    return item


def resolve_binary(candidates: list[str]) -> str | None:
    """
    Given a list of candidate binary names/paths,
    return the first that exists on PATH or disk.
    - Lets us support both "main" and "llama-cli".
    """
    for c in candidates:
        found = shutil.which(c)
        if found:
            return found
        if os.path.exists(c):
            return c
    return None


# ----------------------------
# Routes
# ----------------------------

@app.get("/ping")
def ping():
    """
    Health check endpoint.
    Returns { ok: true, ts: current time }.
    C# tether: MapGet("/ping", () => new { ok = true, ts = DateTime.UtcNow }).
    """
    return {"ok": True, "ts": iso_utc()}


@app.post("/journal")
def journal(item: JournalItem):
    """
    Append a manual journal entry.
    Body: JSON → { text, source?, tags? }
    """
    saved = append_journal(item.model_dump())
    return {"ok": True, "saved": saved}


@app.post("/stt")
async def stt(
    audio: UploadFile = File(...),           # uploaded audio file
    model: str = Form("ggml-base.en.bin"),   # whisper.cpp model filename
    whisper_bin: str = Form("main"),         # binary name (default ./main)
    models_dir: str = Form("models")         # models folder
):
    """
    Speech-to-text endpoint.
    - Saves uploaded audio file to temp
    - Runs whisper.cpp with given model
    - Appends transcript to journal.jsonl
    """
    exe = resolve_binary([whisper_bin, os.path.join(".", whisper_bin)])
    if not exe:
        return {"ok": False, "error": f"Could not find whisper binary '{whisper_bin}'."}

    with tempfile.TemporaryDirectory() as td:
        tmp_audio = Path(td) / audio.filename
        tmp_prefix = Path(td) / "out"

        with tmp_audio.open("wb") as f:
            f.write(await audio.read())

        cmd = [
            exe,
            "-m", os.path.join(models_dir, model),
            "-f", str(tmp_audio),
            "-otxt",
            "-of", str(tmp_prefix)
        ]

        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            return {"ok": False, "error": "whisper.cpp failed", "stderr": proc.stderr}

        transcript = (tmp_prefix.with_suffix(".txt")).read_text(encoding="utf-8").strip()

    saved = append_journal({"text": transcript, "source": "stt", "tags": ["voice"]})
    return {"ok": True, "transcript": transcript, "saved": saved}


@app.post("/summarize")
def summarize(
    text: str = Form(...),                 # text to summarize
    model: str = Form("tiny.gguf"),        # llama.cpp model filename
    llama_bin: str = Form("llama-cli"),    # binary (default llama-cli)
    models_dir: str = Form("models"),      # models folder
    tokens: int = Form(256),               # max output tokens
    temp: float = Form(0.7)                # temperature (creativity)
):
    """
    Summarize input text using llama.cpp.
    - Creates a simple "Summarize this..." prompt
    - Runs llama binary
    - Appends summary to journal.jsonl
    """
    exe = resolve_binary([llama_bin, "main", os.path.join(".", llama_bin)])
    if not exe:
        return {"ok": False, "error": f"Could not find llama binary '{llama_bin}' or 'main'."}

    prompt = f"Summarize the following text into 2–3 bullet points:\n\n{text}\n\nSummary:"

    cmd = [
        exe,
        "-m", os.path.join(models_dir, model),
        "-p", prompt,
        "-n", str(tokens),
        "--temp", str(temp)
    ]

    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        return {"ok": False, "error": "llama.cpp failed", "stderr": proc.stderr}

    summary = proc.stdout.strip()

    saved = append_journal({"text": summary, "source": "summary", "tags": ["llm"]})
    return {"ok": True, "summary": summary, "saved": saved}
