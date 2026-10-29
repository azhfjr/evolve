# Evolve super-app release — 23 October 2026

Live: **https://evolve-rensist.vercel.app/workspace**. Existing Google login now opens the room chooser. Locker Room and Board Room share authentication, navigation, appearance, workspace branding and settings. Board Room is titled **Kalimantan - Power System Projects** and uses Locker Room’s sidebar dimensions.

## Exact release

- Source: `6d7465254eb880855877cf503df830d6f260b66f`, merging existing production source `31449ae4e90847d4f39b9bd66b0ada0f3883d401` without removing its task ranges, cost precision or theme refinements.
- Project: `prj_4Cvh0pTUBDKUvva5eE9GmNLFcNie`, team `team_mF9F9Hs0sIxRfeZwh6VpBQB3`.
- Final ordinary-build deployment: `dpl_2KhLh7m3qNfxhJEAYDrhX2W7irvM`, READY. Uploaded source SHA/digest matched the reviewed candidate; uploaded digest `45c1883b82efcf281bb29449a032eeca4ac8baf2f7a8815fe478d0cac1e426cf`.
- Provider alias API confirms `evolve-rensist.vercel.app` points to that exact deployment. Verified 2026-10-23 10:12 UTC.
- Controlled migration build: `dpl_38ENCVJjYtYi2vXK4bgAGf2UaJt4`. Logs confirm `Already applied:` for migrations 0001–0016 and `Applied: 0017_board_room.sql`. Board SQL SHA-256: `1874bc43db478b502cffef8dff733e75765f4c358d86da1bb95e68b1e0bfbfc0`.
- Existing traffic remained on the previous deployment during migration/build checks. The final build used ordinary `npm run build`; project automatic domain assignment was restored to its original value. Temporary deployment review links were revoked or confirmed already absent; local access files were removed. Application authentication remained required throughout.

## Verification

After production-source reconciliation: TypeScript and zero-warning ESLint passed; **194 domain/integration tests** and **41 browser workflows** passed. The browser run built the production application first. A fresh independent code review found no critical or important issues.

The exact staged final build and then the live custom domain passed:

- Health 200: ready, database connected, schema current and authentication configured. Health verifies Board Room tables/configuration, migration 0017 and its document-review invalidation trigger.
- Anonymous workspace, Board Room, shared settings, file management, Calendar and events APIs returned 401.
- Forged-origin Board Room and shared-settings mutations returned 403.
- Workspace home and Board Room required login.
- Real Chromium loaded the public demo at 1440 px and 390 px with no horizontal page overflow or JavaScript errors.

Private CRUD, CSV merge, document upload/review invalidation, stage updates/Undo, categories, settings, room switching, keyboard/accessibility and responsive layouts were tested with synthetic sessions on disposable databases. No production owner session was manufactured, and no organization project fixtures were inserted. This release does not establish a new real Google authorization-code exchange, production file CRUD or Calendar device delivery; those require actual authorized accounts. Existing recovery-policy/restore-drill limitations remain documented in the deployment guide.

## Recovery reference

Previous live application: `dpl_25dBBndi7ephqtnWAG9EfsGuMkXx` (source `31449ae`). Migration 0017 is additive; leave it applied during an application rollback. Never automatically drop Board tables, rewrite migration hashes or restore a database. Verify health and domain mapping after any separately authorized recovery.

The older `board-room-preview.vercel.app` is a separate browser-local prototype; the authenticated native application is now on the Evolve domain above.

## Follow-up interaction release

The current production deployment is `dpl_CWh8fs4AR89a2MbGqGg2mURNriiK`, source `7e8d79d`. See [room consistency verification and release evidence](ROOM_CONSISTENCY_REVIEW.md) for the shared sidebar, dropdowns, uploads, switching fixes and live checks. This follow-up introduces no migration or storage-provider change. The deployment details above remain the historical initial super-app rollout.
