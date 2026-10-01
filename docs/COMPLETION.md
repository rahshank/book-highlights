# Completion work — September 30, 2026

Book Highlights is Rahul’s private, offline-capable collection of passages and notes. Preserve the approved serif/rust visual design. Finish capture, reading, search, editing, import/export, automatic sync and deployment; do not reopen the design.

Data lifecycle: edits land in IndexedDB and an atomic outbox, then sync to owner-private D1. Photos remain local pending jobs until an authenticated server OCR request succeeds; extracted passages require human review before saving. R2 holds private source images. Exports include unsynced local content. Deletes propagate as tombstones. Sign-out must not silently discard unsynced changes.

Remaining work:
1. Preserve the July work and complete local CRUD, scans and import/export.
2. Repair sync: pull even with no local changes, monotonic cursors, idempotent writes, atomic D1 updates, conflict-safe merging and automatic retries.
3. Replace bundled bearer-token authentication with private sessions and owner setup.
4. Implement authenticated OpenAI photo extraction and private R2 images; verify actual extraction when the API credential is available.
5. Deploy with canonical GitHub source, provision remaining services, verify mobile/desktop/offline and cloud sync, and obtain one fresh whole-branch review.

Verification: repository tests for mutations, import validation and sync; real local D1 integration tests for authentication, replay, pagination and conflicts; browser screenshots/interactions at desktop and phone widths; hosted auth and sync checks. Never use production personal data as disposable fixtures.

Baseline: 18 tests pass. July work was still uncommitted on local-first-cloudflare-rebuild. API key is empty. Cloudflare deployment OAuth needs a refresh; R2 account activation has already happened in the later app task.

Ruling: continue the existing rebuild branch and preserve all July work rather than create an empty checkout; no unrelated work is present. Cost if wrong: changes are separately committed for recovery.

October 1 progress: implemented local CRUD, JSON/Kindle import, reviewed photo capture, cookie sessions, owner-only email codes, field-level sync, idempotent receipts and integer event cursors. Runtime D1 migration applied; R2 and encrypted OpenAI/Resend secrets configured. Hosted at https://book-highlights.rahulshankar24.workers.dev. Live owner email sign-in and book sync verified. OpenAI returned 429; billing confirms $0 API credit. Minimum $5 top-up requires Rahul; approved test usage remains at most $1.

Verification so far: typecheck/lint/build pass; 26 tests pass, including real SQLite migrations, auth expiry/replay, event pagination, independent edits, OCR response reuse and cancellation after sign-out. Browser/offline QA in progress.

Ruling: use single-owner email codes with 30-day revocable HttpOnly sessions, matching the approved magic-link/bootstrap intent without passwords. No local secret copies or browser API keys. Cost if wrong: change the sign-in surface; library data is unaffected.
Ruling: keep online source-photo viewing separate from offline text. Reviewed highlights remain available offline; pending photos live on the capturing device until reviewed. Export JSON contains text/metadata, not image binaries. Cost if wrong: add a separate photo-backup/download feature.
Ruling: preserve local preview separately from production. It uses an isolated local database and logs test codes without sending email; production cannot load that entry point. No remote credentials or production storage in preview.

Runtime check caught Cloudflare's unsupported fetch redirect="error"; ISBN fetch now uses manual redirects and rejects non-success responses. Live local ISBN lookup returned Fantastic Mr Fox / Roald Dahl. Production email code delivery and login verified in-browser. Typecheck, lint, build and 26 tests green before review. Generated Wrangler files are excluded from lint/typecheck.

Final independent review (cefbe39): five important issues identified and fixed in one pass. Regression tests were observed failing, then passing:
- OCR correction/removal drafts now persist locally and survive background refresh and remount.
- Open edit forms compare with their opening baseline, preserving remote changes to untouched fields.
- Sign-out locks local writes transactionally across tabs before awaiting the server; pending changes block sign-out, and stale tabs cannot write into the cleared database.
- Shared client/server validation rejects invalid IDs, oversized fields and records before local commit. Early invalid IDs are repaired without changing content; fixing an invalid snapshot supersedes it, while other remote changes can still arrive.
- Sync batches respect encoded byte size as well as operation count, including multibyte text.

Final: Ruling: upgrade backup source-metadata loss from minor to important because restoring one's own export should preserve provenance. Source type and valid private-photo references now survive a backup round trip; regression observed RED→GREEN. Image bytes remain in private R2, not JSON.

Reviewer declined live OCR certification, physical iPhone installation, and historical Supabase completeness. Ruling: do not claim any of those as verified. Real browser checks at 390px and 1440px show no overflow; server-stopped reload and manual highlight creation succeeded, and reconnection delivered that exact passage and note to D1. A physical iPhone install remains Rahul's acceptance check. No Supabase source export was available; no migration completeness claimed. Successful live OCR remains blocked only by $0 API credit.

GitHub's Linux run exposed a test timing assumption: finding passage text also matched the still-open textarea before the asynchronous save completed. The test now awaits the rendered Edit button. The former Vercel GitHub integration attempted to build the removed Next app; `vercel.json` explicitly disables those obsolete deployments, following Vercel's git.deploymentEnabled setting. Cloudflare remains the only production deployment.


## October 1 appearance and hostname update

Replaced the oversized all-serif interface with later’s palette and typography: 44px desktop / 32px phone page headings, 24px section headings, 16px body/input text, and 20–21px serif passages. Consolidated the stylesheet, removed the duplicate manifest link, and added a persistent light/dark toggle beside the wordmark. An external pre-paint script applies the saved theme under the existing CSP and is precached for offline launches.

The `hosting/` Pages front door forwards requests through a service binding to the same Worker, keeping authentication, D1, R2 and secrets in one place. Cloudflare accepted `highlights.rahulshankar.com`; Squarespace email verification and its CNAME record are complete. Existing website/later records were preserved. The old Workers address stays functional so pending local changes can still sync.

Local checks: typecheck, lint, all 33 tests, build; actual browser inspection of import and passage views in light/dark at 390px and desktop sizes. Dark preference survives reload and mobile content has no horizontal overflow. Production acceptance passed: Cloudflare reports hostname ownership and certificate active; HTTPS returns 200, email-code sign-in succeeds on the custom hostname, and the signed-in import screen retains dark mode across reload. Anonymous sync returns 401 and cross-origin mutation returns 403 through the Pages front door. Worker version: `b1dd934f-0f75-4b40-8b7b-f113c4eaaadb`. Both GitHub checks pass for the code change. Independent review approved the diff with no actionable findings.


## October 1 — books and articles together

Restored and compared 76 original passages/IDs in live D1 across five books. Unified Library and Add highlight preserve books, articles, notes, Kindle import and the photo-first add-title path. Article URLs and passage links survive sync/backups. Drafts persist across reload/sign-in; source+passage creation is atomic and repeated capture IDs are idempotent. later’s text-selection action holds an unsent device draft and uses a fragment transfer plus a verified receipt.

Fresh review caught six draft and metadata issues; all were fixed with focused coverage. Verification: 41 tests, typecheck/lint/build; later 18 tests/lint/build. Real browser: 390px light/dark capture; offline reopen/save and reconnect; later selection/floating action and reload retention. Recovery and Roam data stay outside Git. Five Roam pages are tagged [[Highlights]] and all 76 markers/passages were read back; a repeat export has zero pending. See ROAM_EXPORT.md for future runs.

Release: [PR #6](https://github.com/rahshank/book-highlights/pull/6) merged as `ddebfae`; Worker `a8a22766-495e-422c-8e10-9f1b7ec43069`. Both GitHub checks passed. Live JS equals `index-DtnlCTug.js`; CSS is `index-g9LoYuDb.css`. Live signed-in Library shows all five recovered counts. A selection from the local later reader reached the live Highlights review form with source details; the test draft was discarded without adding production data. Later [PR #1](https://github.com/rahshank/reading-shelf/pull/1), merge `aa15100`, deployment `1b14218e`, has matching live shell/JS. Full authenticated later-to-Highlights save remains the user's acceptance action; its selection/draft behavior and receipt/duplicate protections are covered locally.
