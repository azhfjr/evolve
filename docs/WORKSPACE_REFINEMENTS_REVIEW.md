# Sidebar, Settings and Activity refinement audit

17 October 2026. Requested outcomes: remove Workspace appearance controls, make sidebar labels readable, replace Quick find's Command+K with Ctrl+F, permit administrator single/bulk Activity removal, refine common surfaces and every Settings menu, and audit responsiveness/performance.

## Changes

- Removed the Workspace appearance section (sidebar-width, content-width and workspace-wide text-size controls). Personal Appearance retains theme, density and reduced motion. Stored legacy workspace layout values are preserved for compatibility but no longer override responsive application sizing. No migration is required.
- Desktop navigation uses a 248–272 px responsive width rather than a viewport formula that could shrink to 208–216 px. Project names wrap; workspace identity and member names get proportional typography. Compact navigation uses a 76 px rail, consistent hit areas, project initials, retained Settings/help utilities and pointer/keyboard tooltips. Collapsing responds immediately, saves the existing profile preference and restores the persisted state if saving fails. Reduced-motion transitions are disabled.
- Ctrl+F (and the corresponding Mac find key) opens/refocuses workspace search; Ctrl+K is retired. Dialogs and unsaved task editing retain their existing guards. The visual shortcut and help text match the handler.
- Activity deletion is a typed workspace command restricted to the configured sole administrator with active-actor and origin checks. Each command accepts 1–100 unique IDs. The transaction deletes only selected activity rows, advances the workspace revision and notifies other clients. Missing rows are safe to retry. Tasks, projects, comments and files remain intact. Confirmation, selected counts, server errors and retry are present in the real UI. No journal entry is recreated to announce deletion.
- Settings uses a consistent hierarchy, bounded forms, aligned sections and action rows. Account, personal Appearance, Google Calendar, Workspace and Files share font/control spacing; mobile inputs keep 16 px text and comfortable targets. Small-screen tabs wrap into readable rows. Search and common modal headers share the scale.
- Task Editor and management screens load in separate chunks when needed; search remains immediately available. Existing draft guards, private files, per-currency Cost semantics, authentication and Google Calendar consent are preserved. Activity refresh/pagination ignores stale requests around deletion and avoids duplicate entries.

## Acceptance and execution

| Outcome                                | Evidence                                                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin-only deletion and data integrity | PostgreSQL integration: ordinary/forged admins denied, duplicate/oversized selections rejected, single/bulk/idempotent deletion, tasks/comments retained               |
| Activity UI vertical slice             | Chromium: create fixtures through real API, confirm/cancel, single/bulk deletion, injected 503 retry, reload and persisted readback, member controls absent/API denied |
| Sidebar readable and compact usable    | Chromium: long project text fits, compact utilities visible, keyboard hints, saved preference after reload, reduced motion                                             |
| Shortcut replacement                   | Chromium: Ctrl+K no longer opens app search; Ctrl+F opens and refocuses/selects query                                                                                  |
| Settings and common forms              | Chromium/axe: all five menus at 1440/768/390/320 px, no horizontal page overflow; task/project entry, draft navigation and keyboard regressions                        |
| Removed layout overrides               | Chromium: absent controls and legacy stored large-text/width values do not override current responsive sizing                                                          |
| Performance                            | Three-run cold-context Chromium lab comparison, 1440×900, CPU 4×, 40 ms latency, 2 MB/s; figures recorded in PR #4                                                     |

Unit/integration, TypeScript, lint, formatting, dependency audit, production build and exact-source full-browser CI results are recorded in PR #4. Tests reset only disposable databases and never delete live organization activity. Reference screenshots 2–4 were not available in the supplied context; the audit covered the app's existing common surfaces and named pages rather than claiming a visual match to unseen images.

## Release and recovery

The deployed baseline before this change is source `1cc4dadcf42c0c847f3f33f3e4fe59cafa48e9de` (`dpl_V2qF89HqqSrEAwDnerGUdotLFYZx`). No database migration is introduced. A protected demo preview is suitable for visual review; it is separate from real organization data. Production promotion requires approval for this release. Returning to the compatible baseline hides deletion controls but cannot recreate journal entries that an administrator has already explicitly deleted. Existing private-draft/tombstone and per-currency safeguards must remain intact.

Lab measurements are not field Core Web Vitals or proof of physical-device smoothness. Safari/Firefox, production user-session deletion and exact correspondence with unavailable screenshots remain outside executed verification. Live organization activity must only be deleted by the owner through the confirmed UI, not as an agent test fixture.
