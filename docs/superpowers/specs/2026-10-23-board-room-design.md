# Board Room — Project Monitoring App

Status: approved for complete implementation on 2026-10-23. Dashboard title: “Kalimantan - Power System Projects”.

Local preview status: `docs/mockups/board-room` now implements an interactive browser-local project database, CSV preview/merge, full project editor, category creation/rename, and persistent local state. This is an explicitly labeled design preview with a role switch, not server-enforced permissions or a shared production database. The production architecture and release boundary below remain separate. Its local CSV importer uses canonical headers directly and requires a primary category for new records; flexible column mapping and the final production field policy remain part of implementation planning.

## Purpose and agreed scope

Board Room gives workspace members an interactive overview of a large project portfolio. Build its independent experience first; combining Locker Room and Board Room through a shared app launcher comes later.

Confirmed decisions:

- Reuse Locker Room's visual language.
- All projects share exactly ten ordered stages, named by the admin.
- Keep progress updates simple; no per-stage date forms or percentage entry.
- Only the admin changes project data/stages, imports CSV data, edits stage names, and creates or assigns custom categories. Other active workspace members can explore and filter.
- Open with a multi-year timeline organized as one project list, sorted by planned commercial operation date (COD), earliest first. Show category on each row.
- Allow zoom into a year.
- Selecting a project expands its details and ten clickable stages directly beneath that row. Do not use a side panel or navigate away for this interaction.
- Provide a filterable project table and monitoring charts connected to the timeline through shared filters.
- Refine the dashboard toward denser information and a rearranged layout. The current mockup proposes Timeline/Table views in one main workspace with a persistent chart rail; this visual revision remains subject to review.
- CSV imports preview changes, merge by Project ID, add new records, and preserve projects absent from the upload.
- Show a visible project count for each of the ten stages, including zero counts.
- Show a separate block for each year with its total planned-COD project count and individual Pembangkit, Transmisi, and Gardu Induk project counts, including zeros. Selecting a block focuses the dashboard on that year; selecting it again clears the year focus.
- Primary project categories match Locker Room: Pembangkit, Transmisi, and Gardu Induk. Additional admin-managed custom categories are separate classifications applied to projects.
- Include numeric project capacity and project links in project details.
- Capacity units are MW, MVA, kms, MWh, MWp, MWac, or a custom unit, chosen by the admin or supplied through the uploaded project CSV.
- Project scheduling uses years and yearly ranges only; no month/day inputs or timeline subdivisions.
- Projects support uploaded files. Only an explicit admin review action marks a project valid; the presence of files alone never grants validity.
- Show project validation indicators and charts/counts of valid projects across the portfolio and within each primary category.

The defaults specified below make this design implementable and remain reviewable proposals, rather than additional user-confirmed requirements.

## Existing foundation and implementation boundary

The repository uses Next.js App Router, React, TypeScript, Drizzle, PostgreSQL, and Better Auth. Existing source includes invite-based membership, an admin role, project categories, year-only planned COD, and task CSV import.

Build a separate authenticated `/board-room` area in this repository. Expand its sidebar with Overview, Projects, Documents, Reports, Database, Categories, and Settings destinations. Overview opens the main timeline; Projects opens the project table; Documents lists authorized project files; Reports presents the existing portfolio charts and summaries; Database provides CSV templates/import; Categories manages shared classifications; Settings manages stage names. These destinations reuse the same services, filters, and records. Reuse existing sign-in, membership checks, primitives, and design tokens. Do not create another identity system or a separate repository.

Use separate Board Room project and stage records. Existing Locker Room projects and tasks are not automatically imported, linked, renamed, or modified. The labels “Locker Room” and “Board Room” describe the intended two-app structure; no existing workspace rename or app switcher is part of this version.

## Dashboard layout and behavior

1. A compact toolbar provides project search, primary/custom category/stage/COD-year/document-validation filters, clear filters, and timeline year-range controls. Reflect filter state in the URL so refresh and links retain the view.
2. The timeline occupies most of the initial desktop viewport. Keep project identification pinned on the left and time headings visible while scrolling. Default to the portfolio's known COD-year range; cap extreme ranges and allow horizontal navigation rather than making columns unreadable.
3. Every row shows project name, primary category, current stage, planned COD year, ready-file count, and document validation status. A checkmark with the text “Valid” appears only after admin review; uploaded but unreviewed files show “Needs review,” and no ready files shows “No files.” Use a year-level milestone for COD. A project with an optional start year also shows a start-year-to-COD-year range bar, including a single-year bar when both years match. Never infer a start year or stage schedule from its current stage.
4. All schedule fields use four-digit years. Focus on a single year or a narrower year range without exposing month/day subdivisions. Unknown COD records appear after known years in an explicit “COD not set” section. Project IDs break ties within a year.
5. Selecting a project name or marker expands a detail region directly beneath its row. The region shows available metadata, capacity, custom categories, project links, and the ten-stage track; selecting again collapses it. Keep one expanded project at a time to preserve readability and scroll position. An explicit “Open project details” link also provides a dedicated authenticated project details page with the same data, links, and admin controls; inline expansion remains the default dashboard interaction.
6. The compact mockup offers Timeline and Table controls above the main workspace. Switching preserves shared filters and shows either the timeline or project register in that area, avoiding a second full project list farther down the page. The table supports search, shared filters, sortable columns, pagination, and project detail access. Its default sort matches the timeline. Changing table sort affects table ordering only, not timeline chronology. The mockup uses a project dialog for table detail access; the working app's dedicated details route remains specified separately.
7. A compact stage summary above the timeline shows all ten admin-named stages and the number of projects currently in each, including zero values. Each project belongs to one stage bucket; completed projects remain in stage 10, with a completed subset count, and not-started projects have a separate count. The stage counts sum with not-started to the filtered project total; do not count a project again for every stage it has passed. Counts reflect all active filters, including a selected stage, and describe this scope visibly. Selecting a stage count toggles that stage filter.
8. Charts show project counts by current stage, primary category, and planned COD year, using the entire filtered result set rather than only the visible page. Include uncategorized/unknown values. Custom categories are available as filters; because projects may have several, do not sum custom category memberships as distinct projects. Selecting a chart group toggles the corresponding shared filter; active filters remain visible and removable. Provide accessible labels and equivalent textual counts.
9. Add a document-validation chart showing valid versus not-yet-valid project counts across the filtered portfolio, and a stacked comparison for Pembangkit, Transmisi, Gardu Induk, and uncategorized projects when present. Display each group's valid count and total, plus a percentage only when its denominator is nonzero. Each project counts once, regardless of its number of uploaded files. The not-yet-valid total consists of “Needs review” and “No files,” which can be inspected separately. Chart selection toggles the same validation/category filters as the toolbar; labels make the active filtered scope explicit. Use the full filtered dataset rather than visible rows.
10. Show filtered and total counts, loading and failure states, and a useful empty state. Members see viewing guidance; admins also get an Import CSV action when the database is empty.

Use sequential accessible pagination/loading for timeline project rows and table rows; request aggregates separately. Never render every row of an arbitrarily large portfolio or horizontally paginate years by fetching project records again.

Place the yearly COD blocks above the stage-count blocks, with both summaries above the timeline. Each block shows its year and distinct project count, including zero-project years within the displayed range. Counts honor search, category, custom category, stage, and document-review filters, but ignore the selected year so the other years remain available for comparison. State this scope near the blocks. Selecting a block toggles the shared COD-year filter used by the timeline, table, and charts; the active block is visibly indicated. Include an unknown-COD bucket when needed, without inventing a year. Compute counts from the full matching dataset rather than the current row page.

Align the three primary category rows identically across yearly cards: fixed color-marker, flexible label, and fixed right-aligned numeric columns; equal row heights; tabular numerals; visible zero values. Primary counts must sum to the year's total when every project is classified; any unclassified group must be explicit. Keep the split readable when values grow to multiple digits and on narrow screens.

For the proposed dense layout, reduce header and summary spacing while preserving legibility and distinct year/stage labels. Put validation charts, category distribution, and document-review counts in a narrow right-hand rail on wide screens. Stack these below the workspace on narrow screens. Use compact project rows with explicit expanded details rather than placing every field on each row. Keep desktop project identification and timeline headings pinned, and bound timeline/table scrolling within the workspace. The mockup illustrates this layout; it does not establish production-scale performance.

## Stage interaction and completion semantics

- Stable stage positions 1–10 are shared across all projects; renaming a stage changes its display name without resetting project progress.
- Admin selects a stage on the expanded track. Earlier stages display as completed, the chosen stage is current, and later stages display as upcoming. Selecting the current stage does nothing. Advancing and moving back are both allowed.
- Show position as “Stage 4 of 10,” not an estimated completion percentage.
- A new project with no imported stage starts at “Not started.” Provide an explicit reset to that state.
- Being in stage 10 does not itself mean stage 10 is complete. Provide “Mark project complete” when stage 10 is current. Completed projects show all ten stages completed; selecting a stage reopens progress at that stage. These are simple project-level actions, not additional workflow stages.
- Give immediate visual feedback while saving. On failure restore the prior state and show a retryable error. Announce successful changes and provide Undo.
- Persist changes with a record version. Undo restores the previous stage/completion state only if no later edit changed that record; otherwise refresh and explain the conflict. Do not silently overwrite a newer edit.
- Record actor, time, prior state, and next state for progress mutations. Do not manufacture historical stage dates for CSV snapshots.
- Viewers receive the same expanded stage display with descriptive status labels, without editable stage buttons. Server authorization enforces this independently of the UI.

## Database page and CSV contract

Provide a browsable Board Room database, a downloadable example CSV, upload, column mapping, validation, preview, and an explicit Import action. The import remains admin-only.

Provide both a blank header-only project-upload CSV template and a separate clearly synthetic example containing the three primary categories. The mockup includes these as actual downloadable files. Both use the same twelve columns: Project ID, Project name, Category, Custom categories, Capacity, Capacity unit, Planned COD year, Current stage, Start year, Description, Location, and Project links. Include guidance on year-only schedules, numeric capacity and units, shared stage positions, and semicolon-separated custom category names. In the working importer, new custom category names are previewed for admin confirmation and created/assigned atomically with the project import. In the mockup, file downloads work while merge execution remains illustrative.

Canonical fields:

| Field                 | Behavior                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project ID            | Required external identity; trimmed, case-sensitive, unique within Board Room. Retained separately from the internal record identifier.              |
| Project name          | Required for new projects; nonempty when mapped for updates.                                                                                         |
| Category              | Optional primary category: Pembangkit, Transmisi, or Gardu Induk. Reject other values with guidance to use Custom categories.                        |
| Custom categories     | Optional semicolon-separated names, mapped to shared admin-managed classifications; list new names in the preview before creation.                   |
| Capacity              | Optional nonnegative finite decimal number; reject invalid numeric values rather than silently coercing them. A capacity value requires a unit.      |
| Capacity unit         | MW, MVA, kms, MWh, MWp, MWac, or a nonempty bounded custom unit label supplied in the CSV. Preserve distinct units rather than assuming conversions. |
| Planned COD year      | Optional four-digit `YYYY`; month/day date values are invalid.                                                                                       |
| Current stage         | Optional integer 1–10; empty new records start as not started.                                                                                       |
| Start year            | Optional four-digit `YYYY`; must not exceed planned COD year when both are present. Enables a yearly range bar.                                      |
| Description, Location | Optional text displayed in expanded details.                                                                                                         |
| Project links         | Optional semicolon-separated HTTP(S) URLs. Admin may add readable link labels in the project editor.                                                 |

Map headers explicitly; ignored columns are visibly listed. Strip a UTF-8 BOM and handle quoted commas, escaped quotes, and line breaks. Reject malformed quoting, duplicate mapped headers, duplicate Project IDs in one file, unsupported primary categories, invalid years/stages/capacity/links, and start year later than COD year. Stage names are display values; importing stage position prevents renames from breaking CSV mapping.

Default limits: 5 MiB UTF-8 CSV, 5,000 project rows per import, bounded text lengths, and paginated preview. These are operational limits, not measured performance claims. Explain limits before upload. Do not reuse the existing task importer unchanged: its parser caps imports at 100 task rows.

For updates, unmapped columns and blank optional cells preserve stored values. This first version does not use CSV blanks to clear fields. Show this rule in the preview. New records use empty defaults for blank optional cells. Omitted projects are never deleted or archived.

Protect dashboard progress from accidental stale CSV values: preserve existing stage values by default; provide an explicit “Update existing project stages from this CSV” option when a stage column is mapped. Preview exactly which stages will change. New records can always initialize their stage from the CSV.

Show new, updated, unchanged, and invalid counts with row-level explanations. Any invalid row blocks import until corrected. Revalidate on the server; commit valid batches atomically so a failed import leaves no partial updates. Bind preview to the file/mapping/options and stored record versions; if affected records change before commit, require a refreshed preview. Repeating the same import must not create duplicates.

CSV row validity is import-format validation and is distinct from a project's document-review status. CSV cannot upload project document bytes, mark a project valid, or change a review decision. External project links do not count as uploaded files. Newly imported projects have no files until documents are uploaded separately.

## Project metadata and admin editing

Primary category is a single choice among Pembangkit, Transmisi, and Gardu Induk, reusing existing category identifiers and display labels. It is distinct from custom categories. Proposed custom category model: multiple reusable named classifications per project, created, renamed, assigned, or unassigned by the admin only. Viewers can see and filter them. Renaming preserves assignments; removing a category with assignments requires unassigning it first, without deleting projects.

Capacity is an optional nonnegative decimal, including zero; empty means unknown rather than zero. Provide a numeric input with an admin-selectable unit: MW, MVA, kms, MWh, MWp, MWac, or Custom. Custom reveals a nonempty bounded text input for the unit label. The CSV Capacity unit column may supply a preset or a custom label directly. Preserve the user's spelling `kms` for that preset and distinguish MW, MWp, and MWac. Store numeric capacity and its unit separately and display them together. A capacity value requires a unit; a unit without a value may be retained as a project default. Validate the resulting merged value/unit pair in CSV preview and commit, including when one mapped field is blank and preserves its existing value. Do not infer a unit from project category, automatically convert quantities, or aggregate incompatible units.

Project links are a list of labeled HTTP(S) URLs managed by the admin, visible in both inline details and the dedicated details page. Reject unsafe schemes and embedded credentials; render labels as text, and open external destinations with appropriate new-tab protections. No external previews or automatic fetching of linked content are required.

All metadata changes use validated admin-only persistence and record versions, and update dashboard filters/counts after saving. Scheduling inputs are start year and planned COD year only. Internal audit timestamps may retain full timestamps; they are not project schedule fields.

## Project files and admin validation

The project details page has a Documents section with file upload, readable filenames, file count, preview/download where supported, and admin removal controls. Inline project details show the ready-file count, validation status, and access to the document list. Proposed permissions follow the agreed admin-only editing model: only the admin uploads/removes documents and validates projects; active members can view/download authorized ready documents.

Reuse Evolve's private file-storage pipeline and its existing size/type/quota policy, reservation/finalization checks, authorized download/preview behavior, and cleanup lifecycle. Introduce an explicit Board Room project attachment relationship so authorization never confuses these records with Locker Room projects. File bytes do not go into the project table or CSV. Pending, failed, or deleting uploads do not count as ready documents. Private document URLs must not become public project links. Local development may use the existing local storage fallback; production document uploads require configured private storage.

Review states:

- No files: zero ready attachments, no valid review.
- Needs review: at least one ready attachment, without a current valid review. File presence never automatically sets Valid.
- Valid: the admin explicitly selected “Mark valid” after reviewing at least one ready attachment. Save reviewer identity, review timestamp, and the reviewed document-set revision. This status reflects the admin's document review, not automatic certification of file contents or project completion.

Proposed freshness policy: a ready-file addition, removal, or replacement increments the document-set revision and clears the current valid review. The result becomes Needs review when files remain, otherwise No files. Failed or pending uploads do not invalidate the existing reviewed set. A progress-stage change alone does not invalidate document review. Admin may explicitly revoke validity to request another review. Keep review/revocation/file-change history; do not silently restore a prior valid status after another upload.

Review actions must verify the document-set revision transactionally. A concurrent file change makes a stale review fail with a request to inspect the updated documents. Require at least one ready file before marking valid. After upload finalization, removal, validation, or revocation, refresh row indicators, counts, and validation charts. Use accessible text alongside checkmarks; stage completion and document validity remain independent statuses.

## Data and service boundaries

- Shared stage configuration: ten stable positions, editable nonempty names, version metadata. Initial neutral names “Stage 1” through “Stage 10” are editable in Stage settings; do not invent domain-specific stage names.
- Board Room project: internal identifier, unique external Project ID, name, primary category, optional decimal capacity and separately stored preset/custom unit label, optional COD year/start year, description/location, nullable current stage, completion flag, record version, timestamps.
- Custom category: stable identifier, unique trimmed name, and project assignments with referential integrity; names are editable without changing assignment identities.
- Project links: project, label, validated HTTP(S) URL, and display order.
- Project documents: existing private attachment records with an explicit Board Room project relationship, ready-state counting, and per-project document-set revision.
- Document review: project, reviewed document-set revision, admin reviewer, review timestamp, revocation/invalidation history. Current Valid requires a matching revision and at least one ready document.
- Progress history: project, prior/next progress state, actor, timestamp, mutation identifier.
- Import service: server-side parsing/validation, explicit mapped-field merge policy, transactional preview/commit checks, and import summary.
- Query service: consistent shared filter schema, deterministic sorting with Project ID as a tie-breaker, paginated rows, filtered and total counts, and aggregate chart results.
- All reads require existing active workspace membership. All mutations require existing admin authorization and the application's established CSRF/origin checks. Keep Board Room data scoped to the existing workspace access boundary; do not add cross-workspace access.

Use additive migrations. Do not migrate production or deploy as part of design approval. Keep development/demo fixtures synthetic and separate from real project records.

## Visual and accessibility direction

Reuse the actual existing palette: background `#fafaf8`, surface `#ffffff`, text `#292d2a`, muted text `#626d59`, border `#e9eae5`, and accent `#416b52`. Reuse Inter Variable for body text and Manrope Variable for headings, existing spacing, controls, and light/dark preferences.

The expansive timeline is the distinctive visual element. Avoid a wall of unrelated statistic cards, decorative animation, or a new visual identity. Use quiet chart framing, legible rows, and restrained animation for expansion, zoom, and stage changes. Respect reduced motion.

Rows expand through keyboard-operable buttons with `aria-expanded` and associated regions. Stage controls have meaningful labels and visible focus. Do not convey state only by color. On mobile, keep project names visible, allow timeline horizontal scrolling within its region, and stack expanded details without overflowing the page. Charts retain readable text alternatives.

## Verification and acceptance

1. Admin can name exactly ten shared stages; renaming preserves every project's stage position. Members cannot mutate configuration, metadata, custom categories, links, capacity, progress, or imports, including direct API attempts.
2. Timeline opens across years in COD order, shows start-to-COD yearly ranges when available, handles unknown COD, focuses on a year without month/day subdivisions, and expands project details inline. The explicit project details page exposes the same project data and links. No project side panel is introduced.
3. Admin can advance, move back, reset, complete, reopen, and Undo progress with persistence after reload. Failed saves and concurrent edits cannot silently overwrite newer state.
4. Search and filters consistently affect timeline, table, all ten visible stage counts, and chart aggregates; clearing a filter restores the relevant projects. Pagination does not change aggregate counts. Stage counts count projects once, include zero buckets, and distinguish not-started/completed semantics.
5. CSV preview and commit correctly handle additions, updates, duplicates, invalid data, mapped/unmapped/blank fields, stage preservation, repeated imports, stale previews, and transaction failure. Projects absent from the file remain intact.
6. Use representative synthetic portfolios up to 5,000 records to verify bounded row rendering, usable filtering, and import limits. Report observed performance and limitations; do not claim an unmeasured speed target.
7. Exercise keyboard operation, reduced motion, desktop/mobile layout, loading/error/empty states, and existing Locker Room regressions. Run repository-required typecheck, lint, meaningful unit/integration/E2E checks, and build; report actual outcomes.
8. Primary categories match Locker Room exactly. Custom category creation/renaming/assignment persists and updates filters without modifying primary categories. Capacity accepts valid numbers and rejects invalid values; presets and custom units persist through admin editing, CSV merge, and reload. Reject capacity values without units, preserve the distinctions among MW/MWp/MWac, and never combine incompatible units. Project links persist, display in both detail surfaces, and reject unsafe URLs. Imports and edits reject month/day schedule values and reversed year ranges.
9. Admin can upload and review private project documents, mark Valid, and revoke review. Members cannot upload, remove, or validate through UI or direct APIs. Unauthorized access to Board Room and Locker Room file relationships is rejected. Pending/failed uploads and project links never count as ready files or grant validity. Document changes invalidate an old review, stale concurrent reviews fail, and status persists after reload. Validation charts count distinct projects correctly overall and per category, handle zero totals, and update after file/review changes. Stage completion and CSV-format validation cannot mark a project's documents valid.
10. Yearly COD blocks show correct full-result counts, retain comparison counts when a year is selected, honor other filters, and toggle the shared year focus. Admin-created custom categories remain available even before assignment; a project can have several and filtering counts that project once.

## Exclusions and release boundary

No combined app launcher, production deployment, automatic Locker Room project synchronization, task management, month/day scheduling, per-stage schedules, manually entered percentages, predictive delay scoring, budget analytics, external notifications, or new sign-in provider in this version.

This specification is a review artifact. Implementation planning follows user review of this file; deployment requires its own authorization.
