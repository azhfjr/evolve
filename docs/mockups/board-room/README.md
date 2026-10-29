# Board Room — historical standalone mockup

An interactive design preview with a browser-local project database. It reuses Evolve's visual style without modifying Locker Room. It is separate from the shared, authenticated production application.

## Status and relationship to the application

This prototype predates the connected Board Room/Locker Room application. Its local CSV contract, year limits, seeded data and navigation demonstrate the historical design; they are not the production API contract. The current product overview is in the [main README](../../../README.md). Companion HTML, scripts, fonts, templates and screenshots are included in this repository. Clone or download the complete directory to run the mockup.

No current availability check of the historical hosted preview is claimed. For the live authenticated application, use https://evolve-rensist.vercel.app.

## Open

Unzip and open `index.html`. Fonts, scripts and CSV templates are included. If your browser restricts local files/storage, serve the folder from the repository root:

```sh
python3 -m http.server 8768 --directory docs/mockups/board-room
```

Visit `http://localhost:8768`. Storage belongs to that browser and origin; different ports or browsers have separate data.

## Working features

- Aligned yearly COD cards with equal-height category rows, fixed numeric columns and tabular digits. Yearly totals and all three primary category counts share the active filters, ignoring year focus for comparisons.
- Dynamic COD years and an explicit COD-not-set bucket; no invented dates.
- Search, shared filters, chart selections, Timeline/Table switching and seven sidebar destinations.
- Inline stage tracks with Undo, reset and explicit completion.
- Full project creation/editing: name, category, numeric capacity/unit, location, year range, description, HTTP(S) links and multiple custom categories.
- Custom-category creation and rename, preserving assignments.
- Admin review indicators and validation charts. Document changes reset review. Only document names/metadata are retained; file bytes are not uploaded or saved.
- Real local CSV preview/merge by Project ID: adds new records, updates matches, preserves omitted projects and blank fields, previews new categories, and preserves stages unless explicitly overridden. Documents/reviews cannot be set by CSV. Invalid data blocks the entire import. A successful merge offers Undo while its notification is visible.
- Filtered CSV export with the same twelve columns as the upload template.
- Browser-local persistence of projects, category definitions, stage names and document metadata. Navigation/filters reset on reload. Storage failures show an explicit warning.
- Reset local preview, with confirmation, restores the original 18 synthetic projects.

## CSV files and contract

`project-upload-template.csv` is header-only; `project-upload-example.csv` contains three synthetic example projects. Both download from Database. Replace example rows before using real data.

Columns: Project ID, Project name, Category, Custom categories, Capacity, Capacity unit, Planned COD year, Current stage, Start year, Description, Location, Project links. Project ID is always required; new records also require a name and Pembangkit, Transmisi or Gardu Induk. Optional columns may be omitted on updates. IDs start with a letter/digit and may contain periods, underscores or hyphens, up to 80 characters.

Use years 1900–2200, integer stage positions 1–10, nonnegative capacity plus unit, and semicolon-separated custom categories/HTTP(S) links. Duplicate IDs/headers, malformed quotes, unknown headers, unsafe URLs, invalid numbers and reversed year ranges block confirmation. Uploads are limited to 5 MiB UTF-8 and 5,000 rows; the preview shows up to 100 rows. The local portfolio limit is 5,000 projects, not a measured performance guarantee.

Export escapes spreadsheet-sensitive text; protective apostrophes may need intentional removal on reimport. Flexible column mapping remains a production feature; the local importer accepts canonical headers directly.

## Scope

The admin/member switch demonstrates UI behavior; it is not authorization security. No shared server database, cross-device synchronization, real file uploads or document-content review is provided. Project details use a dialog. Export includes project fields, not documents, review decisions or stage-name settings. Initial projects/stage names are illustrative. All edits/imports stay in this browser and never affect Evolve production.

## Verification procedure

With the server running, execute from the repository root:

```sh
node docs/mockups/board-room/verify.cjs
```

These are the historical verification instructions; this documentation update did not rerun the prototype suite. In a full checkout, the script creates a fresh Chromium context and verifies yearly count alignment, CSV merge/reload persistence, stage protection and override, review preservation, dynamic/unknown COD, atomic invalid-import rejection, project creation, year/link validation, category rename, member preview controls, reset and mobile layouts. It refreshes screenshots. Override `BOARD_ROOM_PREVIEW_URL` or `PLAYWRIGHT_CHROMIUM_EXECUTABLE` as needed. These checks validate the local preview, not production authentication/storage.

Screenshots: `desktop.png`, `expanded.png`, `table.png`, `database.png`, `categories.png`, `project-details.png`, `csv-preview.png`, `mobile.png`, `mobile-expanded.png`, `mobile-table.png`.

Inter/Manrope licenses are included. The application specification remains at `docs/superpowers/specs/2026-10-23-board-room-design.md`.

Navigation uses Locker Room's measured dimensions: 248–272 px desktop sidebar, 76 px collapsed sidebar, 72 px tablet rail and a 320 px phone/tablet drawer (limited to the viewport). `navigation.css` and `navigation.js` provide the responsive controls. The historical online sample-data preview URL is https://board-room-preview.vercel.app; current availability is unverified.
