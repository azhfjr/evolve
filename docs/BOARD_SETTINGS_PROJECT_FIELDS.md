# Board settings and project fields — 24 October 2026

## Requested behavior

Board Room exposes **My account, Appearance and Files** settings, composed with the same native component, control styles and responsive rules as Locker Room. Google Calendar and Workspace tabs remain available in Locker Room; Board Room no longer presents them. Its People view also omits Calendar status. Profile identity, appearance and invited membership remain common across apps.

Board Room custom-category creation, assignment, filtering, navigation and CSV mapping are retired. Pembangkit, Transmisi and Gardu Induk remain the primary project categories. Historical custom-category tables/assignments are retained internally; this release performs no destructive data migration and exposes no active category command or assignment field.

Projects now include optional **Scope** (text, up to 500 characters) and **Voltage** (text or numeric input, stored as text, up to 120 characters). Values appear in forms, inline/detail views and the project register, and participate in project search. Voltage supports values such as `150`, `150 kV` and `275/150 kV`. Old project data reads these fields as empty until supplied.

The supported CSV contract now has **15 columns**: RUPTL Code, Project name, Primary category, Scope, Voltage, Capacity, Capacity unit, Planned COD year, Current stage, Start year, Description, Location, Project links, Project link labels and Completed. Template, example, importer mapping, preview, exporter and in-app field guide derive from the same registry. Legacy Project ID/Category headers remain accepted; retired Custom categories columns are ignored. Blank cells preserve existing fields, absent projects remain stored and replacement of existing workflow progress/completion remains opt-in. See [the generated field guide](BOARD_ROOM_CSV.md).

## Root causes and repairs

Board’s broad HTML-element styles overrode the shared settings navigation, headings, inputs and button composition. The native settings subtree now receives the shared styles directly, with the common 1.55 line height. Computed font family/size/weight, line height, padding, corners, control heights, display, alignment and gaps match Locker Room for account, appearance and files at desktop and phone widths. People/Activity search fields retain their shared reset.

Regression testing found an independent Locker Room draft race: an autosave already queued could rewrite a draft after successful task creation removed it. Draft writes now check the completed request ID. The guard activates only after a successful save; failed saves retain recovery, and Create another uses a fresh request ID. A controlled timing test reproduced the stale draft before repair and passes afterward.

## Verification ledger

- Full domain/integration suite: **205 passed**, zero failures. Coverage includes optional-field validation, numeric Voltage, legacy reads, idempotent CSV preview, persistent merge/search/export, blank-cell preservation and dormant historical assignments.
- TypeScript/route generation and zero-warning ESLint: passed.
- Initial complete browser sweep: **257 scheduled**, 215 passed, 36 failed, six deferred. A sign-out test had revoked the common test fixture session; it now uses an independent session in the disposable test database. The new project-field test uses the textbox’s accessible role for prefilled multiline text. No assertions were disabled.
- Affected-file recovery: 73 of 79 passed; an obsolete shared-settings-link expectation was updated for the native Board settings button, and the independent Locker draft race above was reproduced and repaired.
- Final targeted regression after repair: **44 passed**, zero failures, including all settings/project-field cases, shared app workflows, original/controlled draft recovery, Create another, failed saves, task attachments, uploads and responsive accessibility.
- Final independent read-only review: no important issue in the final deltas.

The final complete sweep and exact release evidence are recorded below when finished. Tests and screenshots use synthetic disposable local data. They do not establish a new real owner Google authorization-code exchange, production private-file CRUD or Calendar/device delivery. No production session was manufactured. Storage provider, shared 1 GB allowance, schema and permissions are unchanged. The existing upstream Vercel dependency advisory remains documented in [the earlier audit](CROSS_APP_DESIGN_AUDIT.md#upstream-dependency-advisory).

## Visual evidence

- [Account — desktop](screenshots/board-settings-my-account-1440.png)
- [Account — phone](screenshots/board-settings-my-account-390.png)
- [Appearance — desktop](screenshots/board-settings-appearance-1440.png)
- [Appearance — phone](screenshots/board-settings-appearance-390.png)
- [Files — desktop](screenshots/board-settings-files-1440.png)
- [Files — phone](screenshots/board-settings-files-390.png)

## Final complete sweep

The complete browser suite passed **258 of 258 checks**, with zero failures or skips, in 13.8 minutes. This run includes the original draft recovery, the controlled queued-autosave regression, the independent sign-out session and all previously deferred serial cases. The same application source also passed **205 domain/integration tests**, route/type checks and zero-warning lint. The final thousand-task check returned a paginated initial window, searchable data and working export; its local smoke figures are not production performance guarantees.

## Verified publication

Live at https://evolve-rensist.vercel.app/board-room, verified 24 October 2026 16:20 (UTC+7). Exact source `4a01b686301eceb10eb311ed4b16e3ae3e4f3cfd`; READY deployment `dpl_4F9FmapooegrdQDB9VYnfkUhJdXe`; uploaded digest `9a7908b1599a4430efe431bde6bdbbc22dda6f33d43efe86127b7d08c550ca8a` matched deployment metadata. The custom-domain alias points to that deployment. Staged and live health, current schema, authentication/origin rejection, Board management/file scopes, desktop/mobile demo rendering and the exact 15-column CSV header passed without browser errors. No application source changed during the final complete sweep; subsequent changes are documentation and synthetic screenshots only.

Temporary deployment review access was revoked and automatic domain assignment restored. Previous deployment `dpl_31VDrR7SXxNanNqKLvhj77SVJkgJ` is retained as the prior release reference. Older builds predate Scope and Voltage; after new field values are in use, prefer a forward fix and review data compatibility before restoring an older application's writes. No migration or storage/quota change was required.
