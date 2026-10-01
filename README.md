# Book Highlights

A private library of passages and notes, available on your phone and desktop.

**Open:** https://book-highlights.rahulshankar24.workers.dev

Sign in with the owner email and the eight-digit code sent to that inbox. Sessions last 30 days. On iPhone, open in Safari and choose Share → Add to Home Screen.

## What it does

- Add and edit books, notes and highlights; look up title/author by ISBN.
- Import Kindle Notebook text, My Clippings.txt, or a Book Highlights JSON backup. Repeat imports skip existing highlights.
- Photograph a marked page, review the extracted wording, and save the passages. Photos wait on the capturing device while offline.
- Search passages and notes across the library. Export the full local text library as JSON, including unsynced changes.
- Save changes locally first and sync automatically when connected. Independent field edits merge; deletes propagate across devices.

After signing in once online, the installed app can reopen offline for reading, search, manual edits, imports and exports. Keep it open briefly after reconnecting to sync. Browser storage belongs to that browser/device; clearing website data removes its offline copy. Synced text returns after signing in again. Pending scans are local until reviewed, so review or discard them before signing out. Source photos are private cloud files and require a connection to view; JSON backups contain text and metadata, not image files.

## Services and costs

Cloudflare Workers serves the app and API, D1 stores synced text, and R2 stores private source photos. Resend sends owner-only sign-in codes. OpenAI handles marked-page extraction using `gpt-4.1-mini`; each scan is capped at 4,000 output tokens and 30 attempts per hour. A repeated completed scan does not incur another extraction request. No subscription or automatic credit reload was enabled by this build.

**Photo extraction currently needs account funding:** the first hosted test reached OpenAI but the API balance was $0. Add credit in the OpenAI billing dashboard, then use **Retry extraction**. The reviewed-output path passes integration tests; successful live extraction still needs verification after funding.

## Development

Node 24 is used for tests (including its real SQLite implementation).

```sh
npm ci
npm run typecheck
npm run lint
npm test -- --run
npm run build
sh scripts/preview.sh
```

Preview opens at `http://127.0.0.1:8770`. Sign in as `reader@example.test`; the code appears only in the terminal. Preview uses separate local D1/R2, never sends email, and never loads `.env.local` or production secrets. For UI verification use the Codex in-app browser, not shell Playwright in the Fieldwork environment. `npm run dev` is frontend-only.

## Deployment and maintenance

GitHub is the source of truth: https://github.com/rahshank/book-highlights. The default production configuration is `wrangler.toml`; `wrangler.preview.toml` is local-only.

After the checks above:

```sh
npx wrangler d1 migrations apply book-highlights --remote
npx wrangler deploy
```

Encrypted Worker secrets: `OPENAI_API_KEY` (Responses access), `RESEND_API_KEY` (sending access). Never put credentials in `VITE_*` variables or commit local environment files. The app ignores the old bundled sync token. Owner identity is configured in `wrangler.toml`; there is no public registration.

D1 changes and operation receipts are written by triggers in the same transaction as each record. Pull cursors are monotonic integers; push acknowledgements cannot skip unread events. Metadata uses field clocks; a deleted record cannot be resurrected by a stale device. Sessions and one-use codes are hashed in D1; mutation requests require the same origin. Private API responses and source photos are never placed in the service-worker cache.

Migration history preserves the old Next/Vercel/Supabase app in Git. The legacy D1 database contained no books or highlights before the upgrade. An old Supabase JSON export can be restored through Import; no old Supabase content has been claimed as migrated. Optional Ghost/Roam publishing from the former prototype is outside this private-library rebuild.
