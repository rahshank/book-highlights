import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{DATA_DIR / 'highlights.db'}")

# Anthropic API key for Claude vision OCR
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# Publishing
GHOST_API_URL = os.getenv("GHOST_API_URL", "")
GHOST_ADMIN_API_KEY = os.getenv("GHOST_ADMIN_API_KEY", "")
ROAM_GRAPH_NAME = os.getenv("ROAM_GRAPH_NAME", "")
ROAM_API_TOKEN = os.getenv("ROAM_API_TOKEN", "")
