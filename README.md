# Book Highlights Tracker

A web app for capturing, organizing, and publishing book highlights from physical books and Kindle.

## What It Does

- **Scan physical books** — Take a photo of a highlighted page, and Claude AI extracts the text via OCR
- **Import Kindle highlights** — Paste from Amazon's Kindle Notebook or upload a "My Clippings.txt" file
- **Manual entry** — Add highlights by hand with page numbers and notes
- **Search** — Full-text search across all your highlights and notes
- **Publish** — Send a book's highlights to Ghost (blog) or Roam Research
- **ISBN lookup** — Auto-fill book metadata (title, author, cover) from an ISBN
- **Works offline** — PWA support with service worker caching

---

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- A [Supabase](https://supabase.com) account (free tier works fine) — or skip this to use local SQLite
- An [Anthropic API key](https://console.anthropic.com/) for Claude OCR (optional — falls back to Tesseract)

### 1. Clone and configure

```bash
git clone <repo-url>
cd book-highlights
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set your keys (see [Environment Variables](#environment-variables) below).

### 2. Set up Supabase (recommended)

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** in the Supabase dashboard
3. Copy and paste the contents of `backend/migrations/001_create_tables.sql` and click **Run**
4. Click **Connect** (top of dashboard) and copy the connection URI
5. Paste it into `backend/.env` as `DATABASE_URL`

> If you skip this step, the app uses a local SQLite database automatically.

### 3. Run with Docker

```bash
docker compose up --build
```

### 4. Open the app

| Service           | URL                          |
|-------------------|------------------------------|
| App (frontend)    | http://localhost:3000         |
| API docs          | http://localhost:8001/docs    |
| Health check      | http://localhost:8001/api/health |

---

## Environment Variables

Set these in `backend/.env`:

| Variable             | Required | Description |
|----------------------|----------|-------------|
| `DATABASE_URL`       | No       | Supabase PostgreSQL connection string. Falls back to local SQLite if not set. |
| `ANTHROPIC_API_KEY`  | No       | Anthropic API key for Claude vision OCR. Falls back to Tesseract (less accurate). |
| `GHOST_API_URL`      | No       | Ghost blog URL for publishing highlights. |
| `GHOST_ADMIN_API_KEY`| No       | Ghost Admin API key (Settings > Integrations). |
| `ROAM_GRAPH_NAME`    | No       | Roam Research graph name for publishing. |
| `ROAM_API_TOKEN`     | No       | Roam Research API token. |

---

## Architecture

```
book-highlights/
├── backend/             # FastAPI (Python)
│   ├── app/
│   │   ├── main.py      # App entry point, middleware, router registration
│   │   ├── config.py    # Environment variables and path configuration
│   │   ├── database.py  # SQLAlchemy async engine and session setup
│   │   ├── models/      # SQLAlchemy ORM models (Book, Highlight)
│   │   └── routers/     # API route handlers
│   ├── migrations/      # SQL migration files for Supabase
│   ├── uploads/         # Uploaded images (mounted as Docker volume)
│   └── .env             # Environment variables (not committed)
├── frontend/            # Next.js 15 + React 19 (TypeScript)
│   └── src/
│       ├── app/         # Pages and API routes (App Router)
│       └── lib/         # Shared utilities (API client)
└── docker-compose.yml   # Container orchestration
```

### Tech Stack

| Layer      | Technology |
|------------|------------|
| Frontend   | Next.js 15, React 19, TypeScript |
| Backend    | FastAPI, Python 3, async/await |
| ORM        | SQLAlchemy 2.0 (async) |
| Database   | PostgreSQL via Supabase (or SQLite fallback) |
| OCR        | Claude AI (Anthropic API) with Tesseract fallback |
| Containers | Docker Compose |
| PWA        | Serwist (service worker) |

### How the pieces connect

```
Browser (localhost:3000)
   │
   ├── Next.js frontend (serves UI)
   │      │
   │      └── Calls backend API at http://backend:8000 (internal Docker network)
   │
   └── FastAPI backend (localhost:8001 externally)
          │
          ├── Supabase PostgreSQL (cloud) — or local SQLite
          ├── Anthropic API (Claude OCR)
          └── Ghost / Roam APIs (publishing)
```

---

## API Reference

All endpoints are prefixed with `/api`. Interactive docs are available at `http://localhost:8001/docs` when running.

### Books

| Method   | Endpoint              | Description |
|----------|-----------------------|-------------|
| `GET`    | `/api/books`          | List all books with highlight counts |
| `GET`    | `/api/books/{id}`     | Get a book with all its highlights |
| `POST`   | `/api/books`          | Create a new book |
| `PATCH`  | `/api/books/{id}`     | Update book metadata |
| `DELETE` | `/api/books/{id}`     | Delete a book (cascade-deletes highlights) |

### Highlights

| Method   | Endpoint                     | Description |
|----------|------------------------------|-------------|
| `GET`    | `/api/highlights`            | List highlights (optional `?book_id=` filter) |
| `POST`   | `/api/highlights`            | Create a highlight manually |
| `POST`   | `/api/highlights/scan`       | Upload a photo for OCR text extraction |
| `PATCH`  | `/api/highlights/{id}`       | Update a highlight |
| `DELETE` | `/api/highlights/{id}`       | Delete a highlight |
| `GET`    | `/api/highlights/search?q=`  | Full-text search across highlights and notes |

### Other

| Method   | Endpoint                     | Description |
|----------|------------------------------|-------------|
| `GET`    | `/api/isbn/{isbn}`           | Look up book metadata by ISBN |
| `POST`   | `/api/kindle/import`         | Import from Kindle "My Clippings.txt" file |
| `POST`   | `/api/kindle/import-notebook`| Import from Amazon Kindle Notebook (pasted text) |
| `POST`   | `/api/publish`               | Publish highlights to Ghost or Roam Research |
| `GET`    | `/api/health`                | Health check endpoint |

---

## Data Model

### Book

| Field        | Type     | Description |
|--------------|----------|-------------|
| `id`         | UUID     | Primary key |
| `title`      | string   | Book title (required) |
| `author`     | string   | Author name |
| `isbn`       | string   | ISBN (indexed) |
| `cover_url`  | string   | Cover image URL |
| `publisher`  | string   | Publisher name |
| `year`       | string   | Publication year |
| `source`     | string   | How the book was added: `manual`, `kindle`, or `photo` |
| `notes`      | text     | General notes about the book |
| `created_at` | datetime | Timestamp (UTC) |

### Highlight

| Field          | Type     | Description |
|----------------|----------|-------------|
| `id`           | UUID     | Primary key |
| `book_id`      | UUID     | Foreign key to Book (cascade delete) |
| `text`         | text     | The highlighted text (required) |
| `note`         | text     | Personal note about the highlight |
| `page_number`  | integer  | Page number (nullable) |
| `location`     | string   | Kindle location |
| `chapter`      | string   | Chapter name |
| `source`       | string   | How it was captured: `manual`, `ocr`, or `kindle` |
| `source_image` | string   | Path to the original scanned photo |
| `created_at`   | datetime | Timestamp (UTC) |

---

## Database

### Supabase (recommended for persistence)

The app connects to Supabase PostgreSQL via the `DATABASE_URL` environment variable. The connection string is automatically converted to use the `asyncpg` driver.

**Connection pooling**: Uses `pool_size=5` and `max_overflow=10` for PostgreSQL.

### SQLite (default fallback)

If `DATABASE_URL` is not set, the app stores data in `backend/data/highlights.db`. This is fine for local development but won't persist across Docker rebuilds unless the volume is mounted.

### Migrations

Database tables are auto-created by SQLAlchemy on startup. The SQL migration file (`backend/migrations/001_create_tables.sql`) is provided for Supabase, where you need to create tables manually via the SQL Editor before connecting.

---

## Development

### Running without Docker

**Backend:**

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

### Docker volumes

| Volume / Mount             | Purpose |
|---------------------------|---------|
| `./backend/uploads`       | Uploaded scan images (persists on host) |
| `highlights-db` (named)   | SQLite database file (Docker-managed) |

### CORS

The backend allows requests from `http://localhost:3000` only. Update the `allow_origins` list in `backend/app/main.py` if you deploy to a different domain.

---

## Feature Details

### OCR Scanning

1. User uploads a photo of a highlighted book page
2. The backend sends the image to Claude (Anthropic API) for vision-based text extraction
3. If Claude is unavailable or `ANTHROPIC_API_KEY` is not set, falls back to Tesseract OCR
4. Extracted text is returned for the user to review/edit before saving

### Kindle Import

Two import methods:

- **Clippings file**: Upload your Kindle's `My Clippings.txt` file directly. The parser extracts book titles, authors, and highlight text, deduplicating against existing records.
- **Notebook paste**: Copy text from [read.amazon.com/notebook](https://read.amazon.com/notebook) and paste it in. The parser detects book title and author from the pasted content.

### Publishing

Send a book's highlights to:

- **Ghost**: Creates or updates a blog post with all highlights formatted in HTML. Requires `GHOST_API_URL` and `GHOST_ADMIN_API_KEY`.
- **Roam Research**: Adds highlights as nested blocks under a page named after the book. Requires `ROAM_GRAPH_NAME` and `ROAM_API_TOKEN`.
