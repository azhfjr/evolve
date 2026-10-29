# Implementation decisions and tradeoffs

1. Retained the task-owned work branch and existing workspace; no merge/push or deletion of unrelated work. Generated historical screenshots/query plans were preserved before restoration. Tradeoff: repository integration stays on the existing branch.
2. Regional comparison excludes all geographic filters; matching totals apply the full query. Tradeoff: two totals must remain explicitly labelled to avoid denominator confusion.
3. Province classification accepts whole known names/aliases/ISO/BPS codes without city inference or stored-data rewriting. Tradeoff: unknown locations remain visible for administrator correction.
4. Used pinned, locally bundled GeoBoundaries polygons and an equatorial SVG projection. Tradeoff: boundary vintage2017 is disclosed and future updates require reviewed regeneration; no external mapping dependency.
5. Restored saved font/content preferences under the approved specification, preserving absent retired controls. Updated the obsolete ignored-setting assertion. Tradeoff: historical saved appearance settings now apply; standard/wide remains default.
6. Regraded lost keyboard focus feedback Important and fixed it with separate focused/hovered state. Tradeoff: keyboard focus takes precedence over transient hover feedback.
7. Used an isolated clean commit for held-build upload. Later audit/test-harness commits leave application code unchanged, checked before promotion. Tradeoff: release source and evidence commit are recorded separately.
8. Separated each initial route inspection into a fresh page with all application pageerrors checked before teardown. No diagnostic message filtering or product CSP/auth relaxation. Tradeoff: navigation between routes is covered by separate passing critical/connected journeys.

No minor review finding remains deferred. Retained16px phone-input minimum and content-sized sparse bars from the inherited balanced refinement to preserve browser usability and avoid empty panels.
