# Attachment upload — browser CSP and transport fix

17 October 2026. The owner reported a failed live upload and authorized repair.

## Confirmed cause

The installed `@vercel/blob` 2.8.2 client uploads through `https://vercel.com/api/blob/`, while the previous CSP only allowed the Blob storage/download hosts. A browser on the public production domain emitted a `securitypolicyviolation` for `connect-src` at that API and `fetch` failed with TypeError. The production store was available and private in Singapore. Local filesystem upload tests had not exercised the external browser transport.

CSP now allows only the Blob API path and existing storage hosts. Unrelated endpoints on vercel.com remain blocked. Authentication, owner-only draft access, private storage and file validation are preserved.

## Transfer behavior

- File bytes transfer directly from the browser to private Blob storage using a scoped, expiring client token. They do not pass through the application's server request-body limit.
- Files above 5 MiB use SDK multipart transfer, allowing parallel parts and retry of a failed part.
- Expired-file cleanup runs with Next.js `after()` after the reservation response, including rejected quota requests from authenticated users. A reservation no longer waits for up to twenty remote deletions. Scheduled maintenance remains enabled. Cleanup failures retain deletion metadata for retry.
- Existing image/document limits, MIME/signature checks, quotas, permissions and atomic task linking remain in force.

## Verification

New Chromium regression tests execute the installed browser SDK against the real CSP/API URL for 256 KiB and 11 MiB files. External Blob responses use a controlled transport fixture; actual streamed request bytes are captured from a clone because CDP omits streamed File bodies. Finalization, private readback, task creation and persistence use the real app with disposable PostgreSQL/files. The multipart test injects one transient failed part and checks that only that part retries. Other members cannot read a draft, then can read the linked task file. Unrelated Vercel API paths remain blocked.

`scripts/blob-smoke.ts` is an explicitly guarded production infrastructure check. During an approved Vercel build, it uses the configured private store and scoped client tokens to upload 256 KiB/11 MiB synthetic files, checks exact metadata and SHA-256 readback, confirms anonymous downloads fail and deletes every test object in a finally block. It never creates organization tasks, project costs or user sessions, prints credentials, or copies production bindings into preview environments. Timings describe the build environment and are not a promise about every user's connection.

The full release CI, live storage probe output, deployment ID, exact source/digests and post-release browser CSP checks are recorded in PR #4. The prior task/Cost rollout is documented in [the earlier release record](RELEASE_2026_10_17.md). This check does not impersonate the owner's Google session; full signed-in user interaction is distinct from the production storage probe and local authenticated browser coverage.

## Operation and recovery

A document loaded before the release retains its old CSP until it is reloaded. Refresh the workspace before retrying an upload. Keep draft-owner and per-currency safeguards on recovery builds; do not restore an older app that lacks them. `EVOLVE_DISABLE_TASK_DRAFT_UPLOADS=1` can pause new pre-creation uploads if needed without making existing files public.

To run the guarded storage probe, use `EVOLVE_RUN_BLOB_SMOKE=1 npx tsx scripts/blob-smoke.ts` only inside the approved production Vercel build. It refuses an ordinary local/preview run. Never expose the read-write token, signed client tokens or object URLs in logs or public artifacts.
