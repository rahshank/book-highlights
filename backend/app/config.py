import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
_env_path = BASE_DIR / ".env"
print(f"[CONFIG] Loading .env from {_env_path} (exists: {_env_path.exists()})")
load_dotenv(_env_path)
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{DATA_DIR / 'highlights.db'}")

# Anthropic API key for Claude vision OCR
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
if ANTHROPIC_API_KEY:
    print(f"[CONFIG] ANTHROPIC_API_KEY is configured (starts with {ANTHROPIC_API_KEY[:10]}...)")
else:
    print("[CONFIG] WARNING: ANTHROPIC_API_KEY is NOT set — OCR will use Tesseract fallback")

# Publishing
GHOST_API_URL = os.getenv("GHOST_API_URL", "")
GHOST_ADMIN_API_KEY = os.getenv("GHOST_ADMIN_API_KEY", "")
ROAM_GRAPH_NAME = os.getenv("ROAM_GRAPH_NAME", "")
ROAM_API_TOKEN = os.getenv("ROAM_API_TOKEN", "")
