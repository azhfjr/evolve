# Regional mapping, purposeful charts and shared UI — 27 October 2026

Status: implemented, independently reviewed, locally verified and published. Production health/access/static checks verified; signed-in workflows verified in disposable environments.

## Implemented

- Five-province Kalimantan SVG choropleth, accessible controls/tooltips/table, source/ODbL disclosure and downloadable boundary database. No external map service.
- Canonical aliases and parameterized SQL classification; missing/unrecognized locations explicit. Original locations preserved. Geography propagates through project lists, saved views, CSV/report export, project-scoped assets and connection maps.
- Comparison counts exclude geography; matching counts use all filters. Both reconcile five provinces plus exceptions to distinct project totals independently of pagination.
- Balanced dashboard ordering and varied pie/donut/stacked-column/year-column/ranked-bar charts; exact capacity/units retained, tiny shares truthful, readiness denominators/totals visible, configured stage labels and proportional stage marks.
- Shared title/panel/body/caption tokens, sidebar parity, long-file/dialog layouts and responsive interactions. Saved text/content settings apply in both shells; defaults remain standard/wide. No retired controls reintroduced.

## Confirmed defects fixed

1. Conflicting intermediate/mobile title sizes bypassed shared tokens.
2. Multi-node SVG title children caused hydration errors/empty accessible titles, including an existing Locker chart; now single text strings.
3. Small positive shares rounded to0.0%; now<0.1%.
4. Saved font/content preferences were ignored; Board also lacked comfortable-width CSS.
5. Undefined SVG neutral-fill token produced black zero-count provinces; theme neutral and quantitative legend corrected.
6. Pointer leave discarded keyboard focus feedback; focused/hovered map states separated.
7. Inherited balanced fixes retain capacity record counts, honest empty messages, finite subnormal geometry and refreshed tooltip values.

## Verification

See results.json for exact counts and scale.json for per-endpoint timings. Domain320/320; dashboard10/10; connected14/14; critical Firefox/WebKit8/8; connected Firefox/WebKit28/28; final regional Chromium9/9. Regional cross-browser17/18 originally included one WebKit route-harness cancellation diagnostic; final isolated route audit passes3/3 across Chromium/Firefox/WebKit,32 principal route entries at390/1440px in both themes/large fonts. All pageerrors checked during each live inspection; none filtered by message. Separate navigation/unsaved-edit journeys remain covered.

Full Chromium recorded305 passing journeys and one superseded test assertion requiring saved font settings be ignored. The approved current contract preserves them; corrected actual browser journey passed separately1/1, including18px controls, reduced motion and viewport fit. This is not relabelled as an all-green original full run.

Six-width matrix covers320/390/768/1024/1440/1920, both apps/themes/font scales and reduced motion. Native Chromium200% zoom verified both apps:1440 physical/720 CSS pixels, scroll720, ratio2. Representative automated accessibility and keyboard tests pass. Route inspection waits finite data/prefetch requests; persistent SSE excluded from settling, not from functional tests.

Scale fixture1000 projects/10000 assets/20000 tasks fully paginates; relationship rendering173 nodes. Ten API measurements,20 samples each after warmup, p95 approximately18–195ms in recorded3CPU/10GB environment; geography195ms, regional assets125ms. No claim of production-wide capacity guarantees.

Final type/lint/format checks and dependency audit pass; advisories0. Ordinary Vercel production build READY; eleven held health/private/retired-route/static checks pass with0 browser errors; source geometry checksum matches. No database migration/storage-provider change.

## Geometry provenance

GeoBoundaries IDN-ADM1-65028918, revision9469f09, vintage2017, OpenStreetMap/Wambacher, ODbL1.0. Five source geometries retained unchanged. Independent reviewer fetched upstream and verified source hash plus exact geometry equality. Preparation validates uniqueness/types/rings/coordinates; derivative licence/provenance downloadable. Vintage disclosed in UI.

## Independent review and decisions

Independent fresh review found no security/data-integrity issue; comfortable-width defect and focus-feedback issue reproduced and fixed. Focus feedback regraded Important because required keyboard feedback disappeared. All review findings addressed; no deferred minors.

- Existing task-owned branch/workspace preserved; generated historical screenshot/query-plan replacements retained as evidence and restored.
- Comparison deliberately ignores all geographic modes; matching uses full query. This prevents selected provinces from erasing comparison values; UI explains both scopes.
- Conservative aliases do not infer city provinces; numeric BPS codes match whole values only. Unknown values require correction rather than silent reassignment.
- Saved font/content settings respected under the approved specification; old ignored-setting assertion updated, retired controls remain absent.
- Fresh isolated pages separate route inspection from teardown cancellation; actual navigation retains dedicated coverage. No CSP/auth relaxation or application error suppression.
- Held source built from an isolated clean commit snapshot so generated screenshots cannot alter deployment input. Later route-harness/evidence commits do not alter application code; source identity recorded explicitly.

## Coverage and limits

See coverage.md. Real Google consent and live Calendar-provider writes were not performed; fixtures verify auth initiation/state/PKCE and access boundaries. Production checks use health/access/static assets without synthetic records/files. Historical compatibility uses disposable legacy/seeded records, not a complete production-history export. Automated accessibility complements representative manual/browser checks, not every assistive-technology combination. Provider runtime-log API returns403 and CLI is unavailable; application health verification is separate from a platform log scan.

## Release

Live at https://evolve-rensist.vercel.app/workspace. Promoted exact held deployment `dpl_33A7Uf61RggcjcQvwMda55vB9JgD`, source `baa2d0efdc935367d8aafe3ace3859a6ecdfa232`, digest `be36faa85e242569172abe98b87c1d489a12210a586be662da5fed721b16f927`. Application source is unchanged by later route-harness/evidence commits. Eleven canonical health/access/retired-route/static checks pass, including exact boundary checksum. Normal auto-assignment restored; both temporary candidate access links revoked. Rollback target `dpl_2Fd3rdfaXKHLrBxe37refYhKyoSS` retained. No production test records/files created. Runtime-log retry on final deployment returns403; no platform-clean-log claim. Details: production-verification.json and release-gates.json.

Implementation rulings and their tradeoffs are recorded in decisions.md. No deferred review findings.
