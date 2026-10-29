# Workspace files and Connection Map review

17 October 2026. Scope: administrator file inventory and single/bulk removal, native transfer feedback, and Connection Map scrolling and label editing. The owner explicitly approved management of all file metadata, including other members' drafts. Draft bytes remain owner-only until task creation.

## Behavior and limits

Production uses private Vercel Blob storage in Singapore. Evolve enforces an application quota of 1 GiB (shown as 1 GB), 25 MiB per document, 2 MiB per profile/logo image, and ten files per task draft. These are application limits, not a statement about Vercel plan billing or a limit on the underlying service.

Settings → Files is administrator-only, including its server endpoint. The inventory searches filename/uploader, filters location and state, orders by date/size, paginates on the server and reports allocation over the entire workspace rather than the visible page. Selection spans pages, up to 100 unique files. Single and bulk removal require confirmation. Removing a linked image clears the member/workspace reference and advances its version. The open settings forms receive the new versions without discarding unsaved text. Audit activity records counts, without exposing draft filenames.

Deleting a file first marks it inaccessible transactionally. Physical deletion is attempted with four concurrent workers. A deletion tombstone reserves allocation until 70 minutes after the original upload reservation, covering the one-hour reservation and ten-minute client token windows. This prevents a late, previously authorized upload from becoming an untracked object. Cleanup re-deletes tombstoned objects after that window before releasing metadata/allocation. Maintenance, later uploads and an eligible manual retry perform cleanup; allocation release is not promised to occur at exactly 70 minutes. Provider errors retain metadata for retry.

Transfer feedback uses the existing design tokens and native progress elements. Upload phases distinguish permission preparation, actual SDK transfer and server verification. Cancel aborts the SDK/fetch and attempts reservation cleanup. Transient finalization failures retry the same reservation, avoiding another upload. Downloads report bytes received from the authenticated stream, validate the final size and then hand the original filename to the browser. “Download ready” means browser handoff, not proof of a disk write. Downloads remain bounded by the document limit.

Connection Map measures actual scene layout rather than its previous SVG extent, so filters can shrink the scroll area. It supports native scrolling/touch, background mouse dragging, keyboard navigation, zoom around the viewport center and reset. Existing results remain mounted during same-filter refresh. Separate Edit labels actions fetch current versions, use compare-and-swap and update only labels. Task permissions and workspace read-only policy apply; project labels require administrator access. Cost items and other entity fields are preserved.

## Acceptance evidence

| Criterion                                      | Check                                                                 | Observed result / scope                                                                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Draft metadata administration, content privacy | PostgreSQL integration and authenticated Chromium                     | Admin inventory/removal allowed; another member's draft content denied; ordinary/forged administrators denied                       |
| Image references and safe removal              | PostgreSQL integration                                                | Avatar/logo references cleared with version increments; immediate read/finalize denied after removal; missing-ID retry idempotent   |
| Late upload lifecycle                          | Controlled local storage fixture                                      | Deletion record retained before 70 minutes; late object re-deleted and record released after window                                 |
| Bulk bounds and capacity                       | PostgreSQL integration                                                | Duplicate/101-ID requests rejected; filtered page retains full workspace allocation                                                 |
| Transfer recovery                              | Chromium with real local API/database and controlled network failures | Cancel/retry, truncated download detection, original downloaded bytes/name, verification retry without second upload                |
| Map persistence and conflict protection        | PostgreSQL and Chromium                                               | Label-only updates preserve Cost/details; stale version/read-only/member-project writes rejected; large map shrinks after filtering |
| Responsive UI and accessibility                | Chromium 320/390/1440, axe WCAG A/AA tags                             | File table scrolls within its panel; keyboard region access; no horizontal page overflow or axe violations in tested states         |

Exact full-suite and CI counts, source SHA and deployment outcome are recorded in PR #4. Screenshots in browser-test artifacts contain disposable/demo data. No real organization files are deleted to validate this feature, no production Google session is forged, and local authenticated coverage is distinct from live production infrastructure checks.

## Recovery and operational limits

No new database migration is introduced. Recover with a forward build preserving tombstone cleanup, owner-only draft reads and per-currency Cost semantics. Older code that treats all deletion rows as immediately disposable can lose cleanup tracking. Pause new draft uploads with `EVOLVE_DISABLE_TASK_DRAFT_UPLOADS=1` if necessary. Never make the Blob store public to recover a download.

A browser cancellation cannot undo bytes already handed to a user's browser. Removal blocks subsequent authorized application reads; it does not revoke previously downloaded copies. Production account-specific interactions remain available for the owner to exercise through normal Google sign-in. Infrastructure verification uses isolated synthetic objects only and removes them.
