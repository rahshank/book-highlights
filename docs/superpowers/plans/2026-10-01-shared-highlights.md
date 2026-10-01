# Shared highlights: approved implementation

Extend the existing private, offline-first app. Keep IDs, legacy routes, Kindle import, photos, authentication and sync intact. Use Library and one Add highlight flow for books and articles.

1. Restore the 5 sources / 76 recovered passages through Import. Verify cloud counts and repeat-import safety; keep private exports outside Git.
2. Add optional source URL/publication date and passage link fields to validation, backups and sync. A shared atomic capture operation creates or reuses a source and saves the passage. Canonical URLs remove fragments and tracking parameters while preserving meaningful query parameters. No arbitrary server-side URL fetching.
3. Add a reviewable capture form, existing-source suggestions, optional notes and source details. Drafts survive sign-in/reload, clear on explicit discard/save/sign-out. Full text-fragment quotes can prefill; partial range fragments require pasted text.
4. Add later reader selection capture. Keep an unsent draft on that device; open a fragment-based transfer to Highlights without sending the passage in HTTP requests. Never claim a highlight saved before Highlights confirms it. Support offline cached app use.
5. Prepare repeatable one-way Roam exports: source pages tagged [[Highlights]], stable highlight/revision markers, append-only changes, durable private receipts. Inspect markers before retrying uncertain writes; preserve all existing graph content.
6. Verify repository and UI behavior (desktop/mobile), run fresh review, merge checked PRs and publish both apps. Record exact deployed revisions and the next user acceptance step.

## Ledger
- Recovery: imported 76 across five books; live D1 IDs, source assignments and every passage match the private recovery export.
- Capture and later handoff implemented. Roam: five pages / 76 exact passage markers verified; repeat prepare returns zero.
- Fresh review: six draft/metadata findings fixed (two-tab draft CAS, incomplete URLs, existing-source reload, cross-tab signout, field baselines, page persistence). Regression coverage added.
- Verification: 41 Highlights tests and 18 later tests; typecheck/lint/build pass. IAB checks: manual article capture, draft reload, offline reopen/save, reconnect, selection action and persistent later draft, 390px light/dark layout. Release pending.
