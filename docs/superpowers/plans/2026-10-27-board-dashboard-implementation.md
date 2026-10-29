# Board Dashboard and Shared Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved Board-first, task-free portfolio dashboard, medium project–asset map, meeting-pack retirement and consistent shared interactions.

**Architecture:** Extend existing authenticated Board read models with complete server-side aggregates, then compose focused chart and bounded SVG map components inside the current overview. Reuse shared controls, live refresh, URL/saved-view state and private document workflows. Preserve historical data and current write permissions; no schema migration is expected.

**Tech Stack:** Next.js 16, React 19, TypeScript, PostgreSQL/Drizzle, Radix, native SVG, Node test runner/tsx and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-board-dashboard-design.md` (approved with no additional analysis cards).

## Global Constraints

- Board Room first/left in chooser and switcher; sign-in still lands on chooser.
- No task summaries, charts, previews or shortcuts in Overview timeline/map details. Dedicated project Tasks tabs and Locker remain available.
- Order: summary, stages, aligned COD category counts, timeline, requested analysis charts, medium map.
- Map viewport: 360px desktop, 280px phone; fullscreen only on explicit action. Maximum 250 rendered nodes, with progressive access to all records.
- Chart set: stages, evidence readiness, asset coverage/categories, project category, capacity by COD year/unit, project location. No additional analysis cards.
- Capacity sources remain independent and unlike units are never summed. Missing values remain visible.
- Shared sidebar width `clamp(248px,18vw,272px)`; gutters 24/18/16px; existing themes, accents and Inter Variable typography.
- Retain IDs, existing tasks, private files, historical meeting rows, migration files and Meeting Notes purpose. Remove active meeting-pack functionality; retain ordinary Portfolio reports.
- No synthetic real-project files or records in production verification. Recheck dependency advisories; verify exact held ordinary build before promotion.
- Before implementation read `AGENTS.md` and relevant Next documentation under `node_modules/next/dist/docs/01-app/` for client boundaries, route handlers and lazy loading.

## Review Focus

1. Custom units and zero capacity: zero is valid, custom units remain separate, missing capacity is not zero (Task 1).
2. Long or duplicate location labels: preserve exact recorded identity, full accessible labels and complete totals (Tasks 1–2).
3. Empty/out-of-range graph pages and hidden selected nodes: totals remain accurate and selection cannot masquerade as a matching record (Tasks 3–4).
4. Slow out-of-order responses after filter edits: latest query wins without losing unsaved input, selection or scroll (Tasks 2 and 4).
5. Large font/200% zoom with filename and dropdown controls: usable width, one main dialog scroll region and keyboard focus return (Task 7).

## File boundaries and delivery sequence

This is one coordinated dashboard release with independently testable tasks. Keep aggregation, chart presentation, graph layout and graph interaction separate; avoid further enlarging `board-room.tsx`. Each task ends with targeted checks and a scoped commit. Tasks 1–4 form the dashboard chain; retirement and shared UI tasks can be reviewed independently. Task 8 gates publication of the integrated result.

### Task 1: Complete dashboard aggregates and filter contracts

**Files:** Modify `src/lib/board-room/model.ts`, `service.ts`, `saved-views-model.ts`; create `src/lib/board-room/dashboard.ts`; test `tests/board-dashboard.integration.test.ts`, extend `tests/board-saved-views.test.ts` and `tests/board-csv-roundtrip.test.ts`.

**Interfaces:** Define `DashboardAnalytics` in `model.ts`, additive `BoardSnapshot.analytics`. Export `dashboardAnalytics(tx: Parameters<Parameters<Awaited<ReturnType<typeof database>>['db']['transaction']>[0]>[0], query: BoardQuery): Promise<DashboardAnalytics>` from `dashboard.ts` (use a local named transaction alias for readability). Call inside `queryBoardRoom`'s existing repeatable-read transaction. Shape:

```ts
// Count arrays include absent/missing groups only when relevant.
type DashboardAnalytics = {
  linkedAssets: number;
  evidence: { category: string; valid: number; review: number; none: number }[];
  assetCategories: { category: string; count: number }[];
  coverage: {
    linked: number;
    unlinked: number;
    unassignedPortfolioAssets: number;
  };
  locations: { location: string | null; count: number }[];
  capacity: {
    source: "project" | "asset";
    year: number | null;
    unit: string;
    total: string;
    measuredCount: number;
  }[];
  missingCapacity: { projects: number; assets: number };
};
```

Use decimal strings for SQL capacity totals. Existing summary supplies stages, projects, valid/review counts and project categories. Add `location: string` (empty means all), `missingLocation: boolean`, `unit: string`, `assetCoverage: ''|'linked'|'unlinked'` to query schema/defaults. Unit matches project figures; asset-source drill-down opens Assets with matching project scope and unit. Preserve existing inputs through defaults. Location filters match exact stored values; reject conflicting location/missingLocation combinations.

- [ ] Write failing tests: `dashboard_totals_ignore_page` seeds 61 matching projects and asserts coverage sum/evidence sum/category sum/location sum equal 61 on pages 1 and 999; `capacity_units_and_zero_are_preserved` checks distinct MW/MWp/custom totals, zero measured and null missing; `year_strip_retains_all_years` verifies selected year does not narrow the strip; `dashboard_filters_round_trip` checks saved-view/URL/export scope for every added filter.
- [ ] Run `npx tsx --test tests/board-dashboard.integration.test.ts tests/board-saved-views.test.ts tests/board-csv-roundtrip.test.ts`; record expected initial failures. Follow existing disposable DB setup; never point fixtures at production.
- [ ] Implement aggregates using the same project predicate and transaction snapshot. Keep aggregate joins from multiplying projects by assets/documents. Extend project predicate and export/saved-view parsing; do not query tasks for analytics.
- [ ] Run targeted tests and `npm run typecheck`; expect all passing. Commit as `feat: add complete Board dashboard analytics`.

### Task 2: Task-free dashboard charts and ordered layout

**Files:** Create `src/components/board-room/dashboard-charts.tsx`, `src/lib/board-room/chart-filters.ts`, `tests/board-chart-filters.test.ts`, `quality/board-dashboard.spec.ts`; modify `src/components/board-room/board-room.tsx` and `src/app/board-room/page.tsx`; create `src/app/board-dashboard.css`, import through the existing stylesheet entry. Create `playwright.dashboard.config.ts` extending the existing connected configuration with `testDir: "./quality"` and `testMatch: ["board-dashboard.spec.ts", "shared-interactions.spec.ts"]`.

**Interfaces:** `DashboardCharts({ snapshot, query, onQueryChange }: { snapshot: BoardSnapshot; query: BoardQuery; onQueryChange: (query: BoardQuery) => void })`. Export pure `chartQuery(query: BoardQuery, patch: Partial<BoardQuery>): BoardQuery` resetting pagination to 1. Reuse existing Board refresh lifecycle; no competing polling loop.

- [ ] Write `chart_query_preserves_context` assertions for unchanged search/sort and page reset. Browser tests assert DOM order summary→stages→COD→timeline→analysis→map, no task metrics/previews, aligned year category columns, keyboard drill-down and URL/back restoration.
- [ ] Run `npx tsx --test tests/board-chart-filters.test.ts` and targeted Playwright journey; verify failures before implementation.
- [ ] Implement summary projects/assets/valid/review; stages before timeline. Add horizontal category/location bars, category evidence stacks, coverage/categories switch, and yearly capacity bars with explicit source/unit selectors. Show top 8 locations plus Other aggregate and expandable complete table; Other opens the table, not an invented location filter. Complete textual tables accompany charts. Capacity asset drill-down must use authorized Assets filters supporting the exact scope; add those filter parameters in `src/lib/assets/service.ts` and `src/components/connected/assets.tsx` through `queryAssets(actor: Actor, input: unknown)`, adding validated `unit` and optional `projectScope: BoardQuery` fields and applying the shared project predicate through an EXISTS clause. Do not navigate to a broader result silently.
- [ ] Add loading/retry/stale state, cancel obsolete reads, preserve filters/scroll on live events and prevent a stale response replacing current data. Browser tests delay first response behind a second query and assert only latest results appear. Empty views offer create/import according to permissions.
- [ ] Run targeted domain/browser checks and typecheck; commit as `feat: compose task-free Board portfolio dashboard`.

### Task 3: Truthful paged connection data

**Files:** Modify `src/lib/assets/explore.ts`, `src/app/api/board-room/connections/route.ts`; create `src/lib/assets/connection-model.ts`, `tests/board-connections.integration.test.ts`; extend existing asset list API only as needed for batch children.

**Interfaces:** Export `ConnectionQuery` from a Zod schema retaining existing q/projectId/year/category/assetCategory/location/voltage/page inputs; add optional `overview: BoardQuery` for overview scoping using shared project predicate. URL endpoint accepts serialized individual `overview.*` fields and validates into this nested object. Preserve current response fields and add `assetTotal: number`. `assetConnections(actor: Actor, input: unknown)` remains the authenticated service. Existing asset listing supplies paged children; add a bounded batch read for visible roots if necessary to avoid one request per node.

- [ ] Tests `empty_page_retains_totals`, `asset_filter_counts_complete`, `overview_scope_matches_dashboard`, `unassigned_scope_is_explicit`, `inactive_actor_rejected` assert independent counts, correct missing-COD/category filters and authorized reads.
- [ ] Run `npx tsx --test tests/board-connections.integration.test.ts`; confirm failures.
- [ ] Replace window-derived root total with separate complete aggregate in same transaction; calculate filtered asset total. Also fix `assetQuality` empty-page total with independent count using its existing issue CTE and add a corresponding assertion in this integration suite.
- [ ] Run targeted suite and typecheck. Commit as `fix: preserve complete connection totals across pagination`.

### Task 4: Medium spatial project–asset map

**Files:** Create `src/lib/project-asset-layout.ts`, `src/components/connected/project-asset-map.tsx`, `tests/project-asset-layout.test.ts`; modify `src/components/connected/explore.tsx`, `src/components/board-room/board-room.tsx`, `src/app/board-dashboard.css`, `quality/board-dashboard.spec.ts`.

**Interfaces:** `layoutProjectAssets(nodes: { id: string; parentId: string | null }[], previous: Record<string,{x:number;y:number}>): Record<string,{x:number;y:number}>`; deterministic, retains known positions and never invents edges. `ProjectAssetMap({ overviewQuery }: { overviewQuery?: BoardQuery })` uses Task 3 API; no query means dedicated Connections filters. Maximum rendered node count 250 including roots, asset nodes and unassigned group.

- [ ] Tests assert stable coordinates, finite coordinates for empty/single roots, known-parent edges only and node-budget enforcement. Browser tests cover selection, keyboard/list parity, pan/zoom/reset/fit, node drag, fullscreen exit/focus, child pagination and hidden-selection explanation.
- [ ] Run `npx tsx --test tests/project-asset-layout.test.ts` and new browser cases; confirm failures.
- [ ] Implement bounded SVG layout/camera, reusing existing connection camera helpers. Render a 360px map below all charts (280px phone). Selection panel shows project identity/stage/year/category/assets/documents or asset technical details; no dashboard task shortcuts. List/pagination accesses nodes beyond budget. Add explicit mobile Explore/Exit mode, reduced-motion behavior and stable positions on refresh.
- [ ] Browser tests assert delayed results cannot revive hidden selections, ordinary mobile page scrolling is not captured, and reconnect refresh preserves unsaved forms. Run targeted checks and commit as `feat: add bounded project asset exploration map`.

### Task 5: Board-first chooser and remembered navigation

**Files:** Modify `src/components/workspace-home.tsx`, `src/components/room-switcher.tsx`; extend `quality/board-dashboard.spec.ts` and existing chooser tests.

**Interfaces:** Preserve current chooser routes and remembered per-app URL contract; change visual/DOM ordering only.

- [ ] Add browser assertions: Board is first DOM/focus entry and left on desktop, above Locker on phone; signed-in root still reaches `/workspace`; switching retains query/selection.
- [ ] Run targeted tests, observe failure, reorder chooser/switcher and update copy without redirect changes.
- [ ] Run targeted tests and commit as `feat: prioritize Board Room in workspace navigation`.

### Task 6: Retire meeting packs, preserve portfolio reports

**Files:** Remove `src/components/connected/meetings.tsx`, `src/lib/connected/meetings.ts`, `src/app/api/board-room/meetings/route.ts`, `src/app/workspace/meetings/[id]/page.tsx`; modify Board sections/page whitelist, `src/components/connected/actions.tsx`, `src/lib/connected/workspace.ts`, `src/app/api/health/route.ts`. Rename `src/components/board-room/meeting-report.tsx` and `src/lib/board-room/meeting-report.ts` to `portfolio-report.tsx` and `portfolio-report.ts`; update `src/app/api/board-room/report/route.ts`, imports and exported symbol names. Update `tests/connected-workspace-services.test.ts`, `tests/board-evidence.integration.test.ts`, `quality/connected.spec.ts`; create `tests/meeting-retirement.test.ts`.

**Interfaces:** Ordinary `/api/board-room/report` contract remains compatible; `PortfolioReport` replaces `MeetingReport` component. Old meeting URLs/APIs return normal not-found/retired responses, no records/writes. Personal actions no longer join packs or expose meeting links.

- [ ] Write retirement tests asserting old routes unavailable, navigation absent, ordinary report still printable, existing follow-up task unchanged and Meeting Notes purpose valid. Keep historical schema/data tests; replace active pack-creation tests.
- [ ] Run targeted suites and confirm failures, then remove feature surfaces and unused imports. Preserve all applied migrations and historical rows, and do not remove task records or document versions.
- [ ] Search all active `src` references for meeting-pack behavior and inspect matches; run targeted tests/typecheck. Commit as `refactor: retire active meeting packs and retain portfolio reports`.

### Task 7: Shared interaction and responsive repair

**Files:** Modify confirmed defective selectors in `src/app/workspace-refinements.css`, `workspace-design.css`, `popup-workspace.css`, `room-design-tokens.css` and relevant shared sidebar/dialog/document components. Add `quality/shared-interactions.spec.ts`; extend `quality/critical.spec.ts` for cross-browser coverage.

**Interfaces:** Preserve existing component APIs, typography tokens and shared sidebar width; use container-aware attachment layout and shared Radix controls. Do not introduce separate Board sizing rules.

- [ ] Reproduce defects with screenshots/computed measurements at 320/768/1024/1440px, intermediate popup widths, large fonts and 200% zoom in both themes. Assert sidebar dimensions match, filename does not wrap character-by-character, filters remain readable, page has no horizontal overflow and dialogs have one main scroll region.
- [ ] Exercise keyboard focus/return, dropdown selection, upload cancel/retry/partial success, private download and delete confirmation against disposable records; capture failing cases before edits.
- [ ] Repair only identified layout/interaction defects, retaining existing permissions/version/quota behavior. Verify accent and reduced-motion preferences; record confirmed defects separately from suggestions.
- [ ] Run shared journeys and critical Firefox/WebKit tests. Commit as `fix: align shared workspace controls and responsive layouts`.

### Task 8: Integrated verification, review and held production release

**Files:** Extend `quality/connected-scale.spec.ts` and disposable fixture preparation; create `docs/audits/board-dashboard-2026-10-27/verification.md` with measured outcomes, defects and limits. Follow existing deployment/recovery scripts only after inspecting their environment assumptions; do not reuse expired auth or private artifacts.

**Interfaces:** Unchanged production data/schema and private access boundaries; exact source commit/build identity recorded. No unfinished navigation is exposed.

- [ ] Self-review spec coverage and request independent whole-diff review. Resolve all Critical/Important findings and rerun affected checks; do not claim flawless behavior beyond evidence.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build`, `npm audit`; record counts and any advisory disposition without carrying forward prior release exceptions.
- [ ] Run `npm run test:e2e`, `npx playwright test --config playwright.connected.config.ts`, `npm run quality:cross`, `npx playwright test --config playwright.connected-cross.config.ts`. Run `npx playwright test --config playwright.dashboard.config.ts` for both new dashboard/shared suites; existing configurations do not select these files.
- [ ] Seed disposable 1,000-project/10,000-asset/20,000-task environment with existing guarded fixture scripts; run `npx playwright test --config playwright.connected-scale.config.ts`. Measure dashboard/graph/filter p95 against <1 second target; inspect query plans, rendered-node bound, complete pagination and no task aggregation in dashboard. Record hardware/runtime/sample counts and actual values; investigate failing target before release.
- [ ] Verify long filenames, custom units/locations, loading/error/reconnect, URL/back/saved views, both themes, keyboard/text alternatives and screenshot section order. Confirm no regressions in archive/read-only and private file permissions.
- [ ] Create held ordinary production build from exact tested commit, verify build identity and authenticated/unauthenticated boundaries before promotion. Preserve current production alias until checks pass. Confirm recovery evidence/current alias; deployment-only rollback must preserve all user writes. No migration/archival operation is authorized by this dashboard plan.
- [ ] Promote exact verified build using existing authorization, verify chooser/Board/Locker/retired routes and health without synthetic live projects/files, record deployment ID and rollback target. Retry authorized runtime-log access; report separately if unavailable. Publish concise result with test limits and production URL.
