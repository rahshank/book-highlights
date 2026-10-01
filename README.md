# Book Highlights

A local-first PWA for capturing, organizing, searching, and syncing book highlights.

This branch is rebuilding the original Vercel/Supabase app as an offline-capable iPhone PWA plus online web app. The current implementation has the Vite PWA shell, the preserved Kindle parsers, and the first Dexie-backed local repository tests.

## Current Features

- **Local library shell** — Library, Search, and Import surfaces matching the current iPhone PWA baseline.
- **Offline local data foundation** — books and highlights persist in IndexedDB through Dexie.
- **Local search and export foundation** — repository tests cover highlight search and nested JSON export.
- **Kindle parser preservation** — existing Kindle clippings and notebook parsers are retained for the import flow.
- **PWA build** — Vite generates installable static assets and service worker output.

## Target Architecture

- **Frontend:** Vite, React, TypeScript, Vite PWA.
- **Local database:** IndexedDB through Dexie.
- **Sync backend:** Cloudflare Worker API.
- **Canonical cloud database:** Cloudflare D1.
- **Image storage:** Cloudflare R2.
- **OCR:** OpenAI vision OCR through a server-side Worker route.
- **Auth:** single-user device/session auth before sync and OCR endpoints.

## Getting Started

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal.

## Verify

```bash
npm run typecheck
npm run test -- --run
npm run build
npm run lint
```

## Migration Notes

The old Next.js, Vercel, Supabase, Serwist, and Anthropic runtime has been removed from this branch. Existing data should be imported later from a JSON export, Supabase dashboard export, or SQL dump.

The next implementation slice is automatic local outbox sync against a Cloudflare Worker/D1 backend.
