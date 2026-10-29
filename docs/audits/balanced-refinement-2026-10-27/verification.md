# Balanced dashboard and shared UI refinement — 27 October 2026

Status: implementation complete; final verification and release pending.

Approved requirements: summary cards directly below portfolio timeline/table; varied readiness/coverage/category/capacity/location charts; balanced shared UI; complete regression audit and authorized held-build promotion. No data migration, dependency addition or storage-provider change.

## Confirmed fixes

- Summary placement follows both timeline and table; map remains medium-sized and last. Board Overview contains no tasks.
- Readiness stacked columns, asset-coverage donut, category pie with counts/percentages, yearly capacity columns and ranked location/asset-category bars replace repetitive thin tracks.
- Full data alternatives and exact SQL decimal capacity strings retained; unlike units/sources remain independent. No zero-data pie slices or synthetic production records.
- Duplicate Board title definitions25/26/24px consolidated into shared24px token; panel/dialog headings16px, body/labels14px and captions12px use scalable roles. Existing16px phone-input minimum retained to avoid browser focus zoom.
- Sidebar labels and metadata use shared body/caption tokens; matching dimensions preserved.
- Configured stage names now appear in map details.

## Independent review

Review covered07b0439..31d7a37, all20 changed files, read-only. No Critical finding. Accepted and fixed all five findings: capacity Records column and descriptive headings; source-aware capacity empty text; finite zero beside tiny capacity; tooltip values derived from active identity/current data; actual content-sized sparse bars matching the recorded design.

Tiny-capacityNaN and stale tooltip percentages were regraded from Minor to Important because accepted values and filtered data must remain truthful. Regression evidence: geometry/rendering failures observed before fixes, nine targeted tests subsequently passed. Browser tooltip regression reproduced33.3% after chart/legend100%; fixed browser rerun pending final build.

## Evidence so far

- Baseline299 domain tests passed; pre-review305 passed.
- Ten dashboard journeys passed before review fixes, including card placement/chart variety.
- Populated pie/column/scoped APIs and configured stage labels passed in disposable fixtures.
- Eighteen principal routes at390/1440px in both themes and large fonts passed without overflow/page errors; serious/critical axe findings0.
- Native Chromium200% zoom verified through temporary isolated extension chrome.tabs.setZoom2: both apps at1440 physical /720 CSS width, scroll width720, devicePixelRatio2. Reproducible script committed; final suite rerun pending.

## Defaults and decisions

- Existing clean task-owned non-main checkout retained; no merge or remote branch mutation.
- Sixteen-pixel minimum phone inputs intentionally differ from14px labels for browser usability.
- Sparse horizontal bars use content-sized height up to280px, preventing empty one-location panels; row cards retain aligned layout.
- Full authorized production rollout will use exact held ordinary build, source identity checks, anonymous/private access boundaries, rollback target and temporary-access cleanup. No synthetic live project files/records.
