# Access and recovery

## Purpose
Keep owner access recoverable without a public bypass, preserving the live library and offline drafts.

## Normal access
Better Auth 1.7.7 runs inside this app's Cloudflare Worker. Passkeys, eight-digit email codes (ten minutes, five attempts), and one-use recovery codes all create the same owner-only session. Public registration and email changes are disabled. Passkey RP is highlights.rahulshankar.com; a later passkey is separate. Save each in a syncing manager such as 1Password. Work laptops can use phone-assisted passkeys when browser/employer policy permits, or the email alternative.

Open Security after signing in. Enroll a passkey yourself through your password manager or device verification. Save the ten recovery codes somewhere accessible if both email and the password manager are unavailable. Codes are displayed once and are hashed in the database. Regeneration replaces the previous batch. Using one invalidates previous online sessions; downloaded offline content is not remotely erasable. Key changes and recovery-code generation require a sign-in within ten minutes.

Existing legacy Highlights sessions and email endpoints work only through 2026-11-01 00:00 UTC, or their original expiry, whichever comes first. They cannot manage passkeys/recovery. Sign out and sign in to establish a Better Auth session. Logout clears both kinds. Recovery clears all old sessions/challenges. The legacy tables remain for rollback and should be removed only in a later reviewed migration.

## Administrator recovery
Requires authorized Cloudflare D1 access. GitHub source access alone does not grant live database access. There is no hardcoded master password, secret URL, or unauthenticated administrative endpoint.

1. Export D1 to a private location before changing it. Keep backups outside Git. The October 1 pre-migration snapshot is in `.private/auth-migration-2026-10-01/before.sql` in this checkout, file mode600. It is a local access-controlled snapshot, not an encrypted offsite backup. R2 photos are separate and unchanged by this migration.
2. Query `SELECT id,email,emailVerified FROM user` and verify the existing owner row. Do not recreate it or alter library data. The first provisioned Highlights identity is `highlights-owner`. Do not change OWNER_EMAIL alone: the application deliberately refuses automatic reassignment of the existing identity.
3. Generate an emergency recovery kit with `node scripts/recovery-kit.mjs highlights-owner .private/recovery-kit`. This writes a plaintext code file (mode600) and SQL containing only its hash. The script never prints the code. Keep the code private; anyone holding it can access the library.
4. Apply the generated SQL to this D1 database through authorized Wrangler access. This revokes existing sessions and pending legacy email challenges and inserts the one-use code. It does not erase passkeys or reading data. Give only the owner access to the private code file; sign in through the ordinary recovery-code form.
5. Immediately replace recovery codes, enroll a usable passkey, and remove lost/compromised passkeys. If Gmail is lost, an administrator can change the email on this same user row plus OWNER_EMAIL in one coordinated release, after verifying the new mailbox and revoking old sessions/challenges. Preserve the user id. If Gmail was compromised, fix that account before trusting email fallback again.
6. Remove the temporary kit from active storage according to Fieldwork's archive policy; the used code is already invalid. Record the date and checks without recording credentials.

Cloudflare, GitHub, Gmail and 1Password each need their own recovery provisions. Avoid keeping the only copy of their recovery information inside an account it is intended to recover. To rebuild outside Cloudflare, keep separate D1 exports and R2 photo copies; GitHub contains code, not the private library.

## Release and rollback
Before this release both D1 databases were exported. Migration0003 only adds auth tables; records/changes/books/highlights/scans are not rewritten. BETTER_AUTH_SECRET is generated randomly and stored with Cloudflare's encrypted secrets; do not rotate it casually. APP_ORIGIN is canonical and the Pages service binding preserves it. No parent-domain cookies are used.

Build/test, apply0003, provision BETTER_AUTH_SECRET, deploy the exact reviewed GitHub revision. Verify email sign-in, session ownership, challenge origin/RP and unchanged library records. Passkey registration/authentication is tested using actual signed P256 WebAuthn messages including synced credentials, missing user verification, wrong origin/RP and replay. The owner's physical-device enrollment remains a user action.

For code rollback redeploy the preceding Worker version; the additive tables can remain. Do not restore the entire database merely to undo authentication code, because that would lose newer highlights. The November1 legacy cutoff also applies after deployment of this source.

## Change log
- 2026-10-01: Standardized authentication and added owner recovery procedure.
