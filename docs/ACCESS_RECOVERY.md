# Access and recovery

## Normal access
Highlights uses the shared personal Better Auth account at https://later.rahulshankar.com. Choose Continue to sign in; the shared page offers a passkey, email code, existing password or recovery code, then returns to Highlights. Security links to the central account. One passkey collection and recovery-code set serve both apps; no new Highlights credential is needed.

Better Auth's OAuth provider and generic OAuth client use exact callback registration, S256 PKCE, verified OIDC identity and owner-only linking. Each app has a host-only session cookie. Highlights stores its upstream access token server-side on the local session and introspects it on protected requests. Central revocation and recovery invalidate dependent online sessions. Signing out of Highlights clears its local copy and redirects through central logout. Offline copies cannot be remotely erased; their online access is checked when they reconnect.

The existing `highlights-owner` identity and all reading records stay intact. Old Highlights passwordless/passkey/recovery routes and legacy sessions are not accepted while SHARED_AUTH_ORIGIN is configured. Old tables remain for rollback, not as another route into the app.

## Administrator recovery
Use the central account recovery runbook in `rahshank/reading-shelf`, `docs/ACCESS_RECOVERY.md`. Do not insert recovery codes into Highlights: its local recovery endpoints are inactive. Cloudflare administrator access is required; GitHub alone cannot grant access or restore private data. Preserve both database backups and R2 photos separately.

The old `scripts/recovery-kit.mjs` remains only for rollback to independent authentication. It does not recover shared access. Recover the existing central owner row rather than replacing identities or reading data.

## Deployment
1. Export both D1 databases privately; do not include exports in Git.
2. Deploy the reviewed later authority with migration0004 and the explicitly registered Highlights client. Public client registration/management remains blocked.
3. Store the matching OAuth client secret as SHARED_CLIENT_SECRET in this Worker. Keep BETTER_AUTH_SECRET unchanged.
4. Apply Highlights migration0004 (one additional session field), configure SHARED_AUTH_ORIGIN and deploy the reviewed GitHub revision.
5. Verify fresh login, callback, central revocation, logout and unchanged records. The owner completes real passkey enrollment in the central Security page.

Code rollback restores the previous Worker/config; additive schema may remain. Rolling back to independent auth re-enables old credentials and sessions, so this must be a deliberate security decision. Never restore the full content database merely to undo code.

## Change log
- 2026-10-01: Replaced per-app authentication with the shared personal account; documented central recovery and revocation.
