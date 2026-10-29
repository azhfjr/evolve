# Project Forms, Planned COD Controls and Document Storyline

Approved specification: conversation plan of the same title. Base: 251e903.

## Contract

- New/changed Board COD assignments are 2026–2040 inclusive. Null remains optional; unchanged historical values survive direct and both CSV writes. Read/report ranges remain broad. Start year must not exceed COD.
- Canonical Locker projection constraint accepts the historical Board read range; legacy Locker-only rows keep their original range. This fixes a reproduced mirror-trigger failure without weakening new Board assignment policy.
- Asset helpers describe the existing schema. Use shared hint typography and explicit accessible field names/descriptions.
- Document Date is nullable PostgreSQL DATE on logical_document. No backfill or upload-time inference. Existing binaries, timestamps, current pointers and version numbering remain unchanged.
- Locker canonical project Download all includes shared Board documents and its task attachments; workspace/app Files lists retain their original scopes.
- Canonical Board project documents only; current ready versions only. No task attachments or dashboard/global navigation. Admin metadata edits; existing member reads; archives read-only. Date edits preserve Board validity. Replacements/restores retain the date.
- Editor state lives above refreshed rows so moves to Undated cannot discard unsaved dates. Metadata writes use expected logical-document version, transaction locks and after-commit events. Upload reservations accept optional dates only for new Board documents, include them in idempotency, and preserve quota/private endpoints.
- Storyline appears between Documents and Activity in individual Board project details and in Locker canonical project Documents/Storyline. Shared implementation, URL state, stable keyset pages of 50, separate dated/undated counts, oldest/newest order. Ties sort by lowercase filename then logical ID. Workspace revision invalidates stale traversal.
- Dates display without timezone shifts. Date editor conflicts retain local input and require an explicit metadata refresh/review. Upload metadata locks while transferring. Existing retry/cancellation/version controls remain.

## Execution and evidence

1. COD policy, direct/import enforcement, dropdown and asset helpers.
2. Additive migration, upload reservation, metadata read/write and pagination service.
3. Shared Storyline, document controls, both app surfaces and live refresh.
4. Domain/integration, Chromium, Firefox/WebKit, responsive/accessibility/native zoom, lint/types/format/audit/build; independent final review; migration rehearsal and exact held release verification.

Production publication is authorized after release gates pass. Retain the additive column on rollback. Production checks must be read-only and must not create synthetic records/files/sessions.
