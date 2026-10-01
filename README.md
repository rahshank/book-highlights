# Book Highlights

A private library of passages and notes, available on your phone and desktop.

**Primary address:** https://highlights.rahulshankar.com

The original address, https://book-highlights.rahulshankar24.workers.dev, remains available. Both use the same cloud library. Sign in once at the new address to download synced text; let outstanding changes finish syncing on the old address first.

Sign in with the owner email and the eight-digit code sent to that inbox. Sessions last 30 days. On iPhone, open in Safari and choose Share → Add to Home Screen.

## What it does

- Add passages from books and articles in one Library. **Add highlight** accepts a passage, book title or article link, and optional note; choose an existing source to keep its passages together. Pasted article links fill title, author, publisher and publication date when available; fields stay editable. If lookup fails or you are offline, save with the link as the title and edit it later. Article links from the same canonical URL reuse that source.
- Open **Edit details** for source metadata or ISBN lookup. **Add a title without a highlight** opens a focused source form for notes/photo-first capture; it is optional when saving a passage.
- Import Kindle Notebook text, My Clippings.txt, or a Book Highlights JSON backup. Repeat imports skip existing highlights.
- Photograph a marked page, review the extracted wording, and save the passages. Photos wait on the capturing device while offline.
- Search passages and notes across the library. Export the full local text library as JSON, including unsynced changes.
- Save changes locally first and sync automatically when connected. Independent field edits merge; deletes propagate across devices.

After signing in once online, the installed app can reopen offline for reading, search, manual edits, imports and exports. Keep it open briefly after reconnecting to sync. Browser storage belongs to that browser/device; clearing website data removes its offline copy. Synced text returns after signing in again. Pending scans are local until reviewed, so review or discard them before signing out. Source photos are private cloud files and require a connection to view; JSON backups contain text and metadata, not image files.

The appearance follows later: cream/navy light mode, charcoal/ivory dark mode, sans-serif controls and serif passages. The moon/sun beside the wordmark switches modes and remembers the choice on this browser, including offline.

## Services and costs

Cloudflare Workers serves the app and API, D1 stores synced text, and R2 stores private source photos. Resend sends owner-only sign-in codes. OpenAI handles marked-page extraction using `gpt-4.1-mini`; each scan is capped at 4,000 output tokens and 30 attempts per hour. A repeated completed scan does not incur another extraction request. No subscription or automatic credit reload was enabled by this build.

**Live photo extraction verified October 1:** following the $10 credit top-up, a marked-page test returned both marked sentences exactly and page 42. Review/save/reload and authenticated source-photo viewing passed. The temporary test source was soft-deleted. Physical phone-camera capture remains the user acceptance check.

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

The custom hostname uses a Cloudflare Pages front door with a `BOOK_APP` service binding to the existing Worker. It forwards the original request, preserving same-origin checks and host-only cookies. D1, R2 and secrets remain in the Worker. Squarespace has `highlights CNAME book-highlights.pages.dev` with a 4-hour TTL; other DNS records are unchanged.

Regular app releases only need the Worker deployment above. If the forwarding configuration changes, deploy it from `hosting/`:

```sh
cd hosting
npx wrangler pages deploy --branch claude/book-highlights-tracker-Uysdc
```

Encrypted Worker secrets: `OPENAI_API_KEY` (Responses access), `RESEND_API_KEY` (sending access). Never put credentials in `VITE_*` variables or commit local environment files. The app ignores the old bundled sync token. Owner identity is configured in `wrangler.toml`; there is no public registration.

D1 changes and operation receipts are written by triggers in the same transaction as each record. Pull cursors are monotonic integers; push acknowledgements cannot skip unread events. Metadata uses field clocks; a deleted record cannot be resurrected by a stale device. Sessions and one-use codes are hashed in D1; mutation requests require the same origin. Private API responses and source photos are never placed in the service-worker cache.

Migration history preserves the old Next/Vercel/Supabase app in Git. The legacy D1 database contained no books or highlights before the upgrade. An old Supabase JSON export can be restored through Import; no old Supabase content has been claimed as migrated. The approved legacy recovery restored 76 highlights across five books. Original source photos were unavailable; recovered text is intact.

## Article capture and Roam

In later’s reader, select text and choose **Save highlight**. The draft stays on that device until you open and save it in Highlights. If offline, Highlights must have been opened on that browser previously; otherwise leave the draft in later and open it when connected. Signed-out users can sign in without losing the transfer. A closed destination tab or lost receipt leaves a retryable draft; the same capture ID prevents repeat saves.

For external pages, paste the passage and its URL into Add highlight. A full text-fragment link may prefill the quotation; range-only links cannot reconstruct missing words. Titles/authors from later are filled in; other links use manual source details rather than fetching arbitrary sites.

Drafts in Highlights survive reloads in the same tab; save before closing it. Sign-out clears drafts. Saved highlights sync normally.

Ask Codex to **sync my highlights to Roam** when wanted. The first 76 passages were exported on October 1; each source page has `[[Highlights]]`. Exports add new passages or explicit revisions without overwriting your Roam notes. No schedule or direct app-to-Roam credential is configured. See [Roam export routine](docs/ROAM_EXPORT.md).
