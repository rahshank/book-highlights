# Book Highlights

A PWA for capturing, organizing, and searching book highlights. Snap a photo of a page, import Kindle clippings, or add highlights manually — then search across your entire collection.

## Features

- **OCR Capture** — photograph a book page and extract highlights using Claude's vision API
- **Kindle Import** — paste "My Clippings.txt" or upload Kindle notebook exports
- **Full-text Search** — search across all highlights instantly
- **Book Management** — organize highlights by book with ISBN lookup for cover art and metadata
- **Publishing** — export highlights to Ghost CMS or Roam Research
- **PWA** — installable on mobile, works offline

## Tech Stack

- **Next.js 16** (App Router) with TypeScript and Tailwind CSS
- **Supabase** for database (PostgreSQL)
- **Claude API** for OCR text extraction
- **Serwist** for service worker / PWA support
- **Vercel** for hosting

## Getting Started

### 1. Set up Supabase

Create a Supabase project and run `supabase-schema.sql` in the SQL Editor to create the tables.

### 2. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in your keys:

```bash
cp .env.local.example .env.local
```

### 3. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app.

## Deployment

Deployed on Vercel. Environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`) must be set in the Vercel project settings.

## Backlog

- **Auth** — simple password or username/password gate so the app isn't publicly accessible (password stored as env var in Vercel)
- **ISBN barcode scanning** — use phone camera to scan a book's barcode instead of typing the ISBN manually
- **Color palette** — revisit the visual design with a richer, more expressive palette
- **Roam Research tags** — improve Roam export with proper tag structure, e.g. `[[books]]` `[[reading]]` `[[Book Title]]` on each page
