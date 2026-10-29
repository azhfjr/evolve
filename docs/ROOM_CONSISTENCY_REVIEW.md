# Locker Room and Board Room interaction consistency — 23 October 2026

## Delivered behavior

The sidebar brands identify their current application: **Locker Room** and **Board Room**. Both reuse `SidebarWorkspacePicker`, `SidebarCommonLinks`, `SidebarFooter`, `SidebarNavigation` and collapsed-navigation hints. Common features include workspace identity, Quick find, People, Activity, admin Files, Templates, Workspace home, saved Theme, Settings, keyboard help, account menu and session sign-out. Main task and project-monitoring workflows remain specific to their room. Board stage configuration is labeled **Stage settings**, separate from shared Settings.

Board People and Activity reuse the existing workspace management components, load on demand and preserve server membership/admin checks. Selected management links have active styling and `aria-current`; browser Back restores Board’s section. Shared routes retain the Locker task editor’s unsaved-change guard. Board shortcuts ignore typing and nested menus; N creates a project for admins, Ctrl/Cmd+F focuses project search and ? opens help.

Board forms, CSV column mapping and filters use Locker Room’s accessible `AppSelect`; dialogs use the shared `Modal`. Location offers Kalimantan Barat, Kalimantan Tengah, Kalimantan Selatan, Kalimantan Timur and Kalimantan Utara. Existing nonstandard locations remain available when editing, preventing silent data loss. Empty category/location values are submitted from state rather than exposing the picker’s internal empty sentinel.

**RUPTL Code** replaces visible Project ID terminology in editing, validation, imports, exports and downloadable CSV templates. Database identities are preserved. Old CSV files headed Project ID remain supported; RUPTL Code takes precedence if both headers exist. The example CSV now uses Kalimantan locations.

Document uploads reuse Locker Room’s `TransferProgress` and phase callbacks: preparation, uploading, verification, completion, cancellation and errors. Board supports actual cancellation, streamed download progress and explicit document-delete confirmation. Existing file-change review invalidation and private access rules are preserved.

## Switching performance

Dynamic routes now have shared loading boundaries, which permit partial prefetching and responsive navigation feedback. Internal sidebar links use client navigation. Switching retains the browser document; full authenticated snapshots are not deliberately prefetched into a long-lived cache. Tests create a project while in the other room and verify it appears on return.

The initial Board render previously refetched the dashboard after receiving its server snapshot. That redundant request is removed. Successful-query tracking is updated only when a response is accepted, preserving retry after rapid A→B→A changes abort an earlier request. No cross-user server cache or persistent browser cache of private dashboard data was added. These checks establish concrete behavior; no production latency multiplier or universal network SLA is claimed.

## Verification

- TypeScript/route generation and zero-warning ESLint passed.
- Domain/integration suite: **195 passed**, zero failures.
- Final core browser regression: **25 passed**, zero failures, after a production-mode build. Covers both rooms, selectors, CSV merge, blank fields, uploads/cancel/download, stale updates, roles/origins, saved themes, keyboard/focus, mobile and WCAG AA checks.
- Extended browser audit: **65 passed** across workspace CRUD, private file management, task/editor drafts, forms and popup proportions. One new test initially used the wrong request parameter in its interceptor; corrected to `search` and passed in the final core regression. Earlier implementation findings (contrast, query-race bookkeeping and empty picker values) were repaired and retested; assertions were retained.
- Independent read-only review found the rapid-search bookkeeping race and missing management selection/headings. All were fixed. Final review found no important issue in the selector, shortcut or navigation changes.

Tests use disposable synthetic databases and signed fixture sessions. No production user was impersonated. Real owner Google login and private production file CRUD are not established by these fixtures.

## Storage decision

The user chose to retain Vercel Blob while researching larger alternatives. The shared file quota remains **1 GB**. Both rooms already share the same private file store and aggregate enforcement. No provider, billing, credential, quota or database migration change is included. [The researched comparison](SHARED_STORAGE_OPTIONS.md) covers OneDrive (5 GB), Google Drive (up to 15 GB), R2 and Backblaze B2, account requirements and a safe future migration.

## Release

Released on **https://evolve-rensist.vercel.app/workspace**, verified 23 October 2026 at 19:29 (UTC+7).

- Source `7e8d79db3e32a090cc3c896f17f954d5be72d580`; deployment `dpl_CWh8fs4AR89a2MbGqGg2mURNriiK`, READY.
- Uploaded source digest `5f0351927f8ed2c5fa3e042782e721488822d8df19cf2aa83edc81d9685c2860` matched deployment metadata before promotion.
- The provider alias API confirms the live custom domain maps to this exact deployment. Previous application `dpl_2KhLh7m3qNfxhJEAYDrhX2W7irvM` remains the rollback reference.
- Staged and live checks: health 200/ready/current schema; six private APIs returned anonymous 401; forged Board/shared-settings mutation origins returned 403; workspace and Board required login; actual Chromium public-demo checks at 1440/390 px had no page overflow or JavaScript errors. The live CSV template starts with RUPTL Code.
- Ordinary `npm run build`; no migrations, organization fixture inserts, provider changes or quota increases. Automatic domain assignment is restored to its prior value. Temporary deployment review access was revoked.

Private production CRUD and a new real Google OAuth exchange still require actual authorized account sessions; the executed private workflows above used disposable test accounts.
