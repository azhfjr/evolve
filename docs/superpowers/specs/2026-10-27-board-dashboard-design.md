# Board Room portfolio dashboard and shared interaction repair

Date: 27 October 2026 (Asia/Bangkok). Status: approved by user; implementation planning authorized.
Repository baseline: `08b125b`, branch `work`. Baseline domain tests: 286 passed, zero failed.

## Intent and confirmed choices

Evolve is a private Kalimantan power-system workspace. Board Room owns projects and technical assets; Locker Room manages project tasks. Make the portfolio understandable, connections explorable and common interactions consistent on desktop and phones. Preserve the existing identity, permissions, live updates, protected edits, private documents and shared storage.

Confirmed by the user:

- Keep the post-login app chooser. Board Room appears first on the left (first on phones), Locker Room on the right. Board is also first in the app switcher. Do not redirect sign-in directly into Board.
- Use a balanced Board overview: summary, stages and yearly timeline lead, followed by readiness, asset and project analysis charts. A medium-sized project–asset map sits below all chart sections.
- The Obsidian-style graph contains projects and their linked assets. Document details appear on project selection, not as graph nodes. Tasks still belong to projects, never assets.
- The Board overview excludes tasks entirely: no task summary, task charts, task attention indicators or task previews in its timeline/map selection panels. Task management remains in Locker Room; existing dedicated project Tasks tabs remain available outside the dashboard.
- Keep only the requested dashboard charts; do not add voltage distribution, data-completeness charts or a stage-by-year matrix.
- Remove meeting packs completely from the active website.
- Repair page/dialog spacing, typography, chart interactions, sidebars and mobile behavior across both apps.

## Approaches considered

1. **Balanced dashboard — selected.** Summary, stages and yearly planning lead; analysis charts follow, with a medium-sized graph below them for relationship exploration.
2. Map first. Best for relationship exploration, but pushes yearly portfolio monitoring below the first screen.
3. Charts before planning. Useful for comparisons, but the selected design retains stages and yearly planning above the supporting analysis charts.

Implementation approach proposed by the builder: retain Next.js/React/PostgreSQL and the existing authenticated APIs. Use bounded native SVG graphics and existing dialog/select primitives. Avoid a large graph framework or new service. Keep the existing full project details, imports and task editor rather than creating competing workflows.

## Desktop layout

```text
Shared sidebar | Project title / refresh / add / import
               | Search and readable labelled filters / active-filter chips
               | Projects   Assets   Valid projects   Evidence needs review
               | Stage distribution (not started + ten named stages)
               | Planned COD years: aligned Pembangkit / Transmisi / Gardu Induk counts
               | Portfolio timeline (existing inline details and table alternative)
               | Evidence readiness by category       | Asset coverage / asset categories
               | Projects by primary category         | Capacity by COD year / unit
               | Projects by location
               | Medium project–asset map             | Selection details (on selection)
```

The exact chart grid may adapt to available width; section order remains fixed. Proposed map viewport height is 360px on desktop and 280px on phones, with fullscreen and the dedicated Connections page available for deeper exploration. Selection details do not enlarge the map into a dominant section. Graph and charts are clearly bounded sections, with aligned headings, concise definitions and direct actions. Do not add decoration or animated counters. Charts lead the analysis; the graph supports it without dominating the page.

On phones: Board precedes Locker in the chooser; overview sections stack; filters use full readable labels and wrap into rows instead of showing `A…`; summary uses a two-column layout when it fits; years scroll horizontally; the timeline retains its explicit horizontal scroll; graph has a compact viewport with a fullscreen option; project selection details appear below it. Charts stack and offer textual data. No page-level horizontal overflow at 320px or 200% zoom.

## Shared visual contract

Retain the workspace themes and user-selected accent. Palette anchors from the existing light theme: canvas `#FAFAF8`, surface `#FFFFFF`, text `#292D2A`, muted `#626D59`, border `#E9EAE5`, primary `#416B52`. Keep existing dark-theme tokens and category colors (green, violet, ochre), with contrast verified in both themes. Do not force the account accent back to green.

Use Inter Variable for application text, shared type tokens for headings/body/labels/captions and tabular figures for counts. No tiny chart labels or independent inline font scales. Large-font settings must work equally in both apps and dialogs. Consolidate relevant conflicting CSS instead of piling on arbitrary page-specific overrides.

Both sidebars use the same existing width token (`clamp(248px,18vw,272px)`), matching collapsed behavior, row sizes, brand/header/footer spacing and active/hover/focus states. Their functions/menu items remain distinct. Desktop content gutters follow one shared scale (24px, 18px intermediate, 16px phone). Use a coherent 4/8/12/16/24px spacing rhythm, shared controls, clear labels and accessible touch targets.

Dialogs use the shared bounded shell, one primary scroll region, consistent header/body/footer padding, focus trapping and return to the triggering control. Long filenames retain a useful width; controls move beneath file information when needed. Repair the actual task/project/asset/import/file surfaces encountered in the audit, including intermediate widths and large fonts.

## Overview data and chart definitions

All totals are calculated server-side across the entire filtered project set, never from a loaded list page. Read related aggregates in a consistent database snapshot. Exclude archived legacy work. Dashboard reads do not need task aggregates.

- **Summary:** matching projects, linked assets, valid projects and projects needing document review. Each figure explains its scope and opens the underlying filtered view.
- **Yearly category counts:** retain the multi-year COD strip, with aligned rows for Pembangkit, Transmisi and Gardu Induk. Show uncategorized and missing-COD projects explicitly when present. Clicking a year filters the portfolio; clicking its category applies both year and category. Year navigation retains the existing deliberate convention: other filters apply, while the strip still displays all COD years for context. State that convention in the UI.
- **Stage distribution:** not started and all ten admin-named stages. Counts select the existing stage filter. Completion/stage is not described as physical construction progress.
- **Evidence readiness by category:** mutually exclusive Valid, Needs review and No files groups. Valid requires current ready evidence and the existing admin review rule. Selecting a segment applies the matching category/evidence filter.
- **Capacity by COD year and unit:** compare yearly planning figures, with missing COD shown separately. Project figures and linked-asset figures remain independent. Group strictly by exact unit; MW, MVA, kms, MWh, MWp, MWac and custom units are never added together. Show unknown/missing figures separately. Use separate unit scales or textual comparison rather than a misleading shared numeric axis. Drill-down opens relevant project/asset records; any new unit filter must work through URLs, saved views and CSV consistently.
- **Projects by primary category:** horizontal bars for Pembangkit, Transmisi, Gardu Induk and uncategorized when present. Counts and percentages use all matching projects. This portfolio-wide comparison complements the year-specific category strip.
- **Projects by location:** ranked horizontal bars using the existing project location field, with an explicit unspecified group. Show the leading locations plus an Other total and an expandable complete table; never discard the remaining records. Location selection filters the underlying project list. Do not imply geographic coordinates or inferred regional boundaries.
- **Asset categories:** an alternate view in the asset analysis card showing linked assets by their own primary category, distinct from project categories. Use linked assets of matching projects as the denominator; unassigned assets remain separately scoped.
- **Asset coverage:** matching projects with at least one linked asset versus projects without assets. Explain the denominator. A portfolio-wide unassigned-asset count is explicitly separate, since an unassigned asset has no project COD year.

Do not invent historical trends, physical completion percentages, financial forecasts or automatic project validity. The database currently may contain no active Board projects: show helpful zero/empty states and create/import actions, never synthetic production data.

Every chart provides keyboard-operable drill-down, an accessible title and a textual data alternative. Colors are supplemented by names, counts and focus state. Preserve current filters/selection/scroll through refresh, display loading or retry states, and reject late responses from superseded requests. Show stale/reconnecting state rather than claiming Live during disconnection.

## Project–asset network

Visual intent: a spatial network of compact project hubs and smaller asset nodes, with category colors, thin relationship edges and readable labels on selection/focus. It represents recorded assignments only. Do not infer asset-to-asset or project-to-project electrical connections from names/location.

- Show a medium-height network below every chart section in Overview and a larger Connections page using one reusable component/API contract. Fullscreen expands on explicit user action only.
- Search and filter by project name/identifier, COD year, project category and applicable asset category/location/voltage. Reuse the current connection filters and selection APIs where possible. Overview uses the active overview project filters.
- Drag background to pan; zoom buttons, fit, reset and fullscreen; drag nodes to explore; highlight the selected node and its actual neighbors. Keep positions stable during ordinary refresh; no continuous physics animation or automatic recentering while the person is interacting. A small deterministic bounded layout is the builder's call.
- Desktop scroll remains normal unless the graph is focused/explicitly receiving a zoom gesture. On phones offer an explicit Explore map interaction mode so a graph cannot trap normal page scrolling; pinch/pan works inside that mode with a clear exit.
- Selecting a project opens an inline details panel: project identity, stage/year/category, linked asset count, document count/validity and links to the existing Assets/Documents tabs. The Overview panel contains no task content or task shortcuts. The dedicated Connections page may retain a link to the full project command centre, whose Tasks tab remains available. Selecting an asset shows RUPTL code, technical details and its recorded project link, using existing authorized reads.
- Provide a separate unassigned-assets group only when meaningful for the current scope. Project/COD filters do not falsely attach unassigned assets to a matching project; its portfolio scope is stated explicitly.
- Provide an equivalent accessible list view and focus-return behavior. Enter/Space selects a node; Escape clears selection/exits fullscreen as appropriate; controls have descriptive labels. Respect reduced motion.

### Bounded rendering and truthful totals

Never fetch/render 10,000 asset nodes at once. Initial roots/children are paged, with an explicit rendered-node budget (proposed maximum 250). Expanding/searching a project progressively loads matching assets within the budget; pagination/load-more or focusing that project allows access to the rest. Clearly show loaded counts versus complete filtered totals and when the limit is reached. The list view also paginates.

Graph totals, project totals, asset counts and unassigned counts come from separate complete SQL aggregates and stay correct even on an empty/out-of-range page. A filter must not leave a selected hidden record presented as though it matched; either clear selection or explain it. Keep last good data during a refresh, avoid request waterfalls per node and cancel/ignore obsolete responses.

## Meeting-pack removal

Remove navigation entries, pack creation/preview/correction/view screens, meeting-pack endpoints and application service code, personal action-centre pack links/follow-up grouping, pack-related search/navigation references and active feature copy. Update relevant tests to assert removal, not merely hide the menu.

Old pack URLs must resolve to the normal not-found/feature-retired experience with a path back to Board, and old API routes must not return pack records or accept writes. No background path may continue creating meeting follow-ups. Existing follow-up tasks remain ordinary project tasks with their history/attachments/assignees unchanged.

Builder's data-preservation call: retain previously applied immutable migration files and historical database rows, without an active product read/write surface. Do not DROP or purge saved user records as a side effect of removing a feature. This avoids an unnecessary irreversible data migration. Existing ordinary portfolio reports/print/export remain; remove their meeting-pack framing and name them Portfolio report. The attachment purpose “Meeting Notes” remains a valid document label; it is unrelated to meeting packs.

## Reliability, audit and verification

Preserve admin-only asset/project/stage/evidence writes, member task rules, document version permissions, version conflicts, upload quota enforcement and private file endpoints. No new public data endpoint or storage provider. Prefer additive authenticated read models; no new persistent dashboard/layout tables are expected.

Audit both apps' principal journeys: chooser/switcher/sidebar, overview/filter/chart navigation, project/task/asset create-edit-conflict, import preview, document dropdown/upload/retry/version/download/delete and shared Files/settings. Record confirmed defects separately from recommendations. Repair confirmed regressions introduced or exposed by these changes; do not claim every conceivable bug has been eliminated.

Acceptance checks:

1. Board appears before Locker in chooser/switcher, while login still lands on chooser.
2. Meeting packs are absent from navigation/actions/build routes; old URLs/APIs cannot expose them. Existing tasks and document labels remain valid.
3. Charts reconcile against independent fixture counts with more than one page, zero results, uncategorized projects, missing COD, mixed/custom units and archived records. The overview and its inline/map details contain no task metrics, charts or previews; dedicated task workflows remain available.
4. Graph edges represent real project assignments; totals stay complete across pagination/filtering; every record is reachable through search/list; rendered nodes stay bounded at 1,000 projects/10,000 assets/20,000 tasks.
5. Graph selection, panning, zoom, drag, fullscreen and accessible list work on keyboard/mouse/touch without trapping mobile page scroll.
6. Both sidebars and common page/dialog controls have matching computed dimensions/type/gutters; readable filters and file names; no horizontal page overflow at phone/tablet/desktop/intermediate widths or 200% zoom. Both themes, font scales and reduced motion are checked.
7. Concurrent edits, uploads and live/reconnect behavior retain existing boundaries; refreshed views preserve unsaved input and discard stale responses.
8. Relevant domain/integration tests, complete Chromium regression, critical Firefox/WebKit journeys, type checking, lint, formatting, dependency audit and production build pass. Target p95 below one second for graph/summary/filter requests in the documented disposable scale environment; report measured limits and do not imply a production SLO.

## Delivery and release boundary

After design approval: write the implementation plan, make the changes in coherent tested steps, inspect actual browser screenshots, get an independent diff review and fix Important/Critical findings. Provide a reviewable working result and accurate release evidence. The existing user's production deployment authorization persists for necessary release steps; do not ask again solely because this is another iteration. Before any promotion, verify the exact held ordinary production build and dependency/data/access gates. Production smoke checks create no synthetic real-project records/files. If a new destructive data operation, permission change or external service becomes necessary, explain and obtain that specific authorization first.

Known existing verification limit: the Vercel runtime-log connector returned 403 and CLI rejected the available credential format on the prior release. Retry only through available authorized capabilities; distinguish application health/browser evidence from an unavailable platform-wide log scan.
