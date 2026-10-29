# Task identity, exact large costs and independent option totals

20 October 2026. The owner approved the complete revision design: full project names in task list/board; removal of the practical 9/12-digit cap with exact two-decimal money/six-decimal rates; totals only within each option and unit; project expenses remain separate without combined Remaining; cross-page and responsive regression testing. The owner subsequently approved this candidate and migration 0015; application c35545f is now live with schema 0001–0015. See [the production release record](RELEASE_2026_10_20_TASK_COST_PRECISION.md).

## Reproduction and changes

The released UI clips valid 80-character project names in list/board at 1440, 700, 390 and 320 px. CSS applies nowrap/hidden overflow; older mobile/tablet placement rules also conflict. A shared project reference now renders a decorative colored dot and a fully wrapping name, with neutral readable text. Explicit mobile areas prevent project/date/priority/assignee/actions overlap; desktop header and rows share columns. Null assignment displays No project; an unresolved non-null reference displays Project unavailable. Task opening, menus, drag, rename propagation and project-specific context remain available.

Cost input, schemas, draft limits, numeric columns and SQL option validation previously capped practical amounts. They now accept large exact strings. Grouping uses linear slicing; all monetary/rate arithmetic uses BigInt minor units. No monetary value is coerced to Number. Physical boundaries remain: PostgreSQL numeric permits up to 131,072 whole digits, currency/rate precision remains two/six decimals, and command requests are streamed with a 2 MB limit. These are technical storage/resource limits, not a promise of infinite memory or unlimited request size. Draft parsing/fingerprints are sized consistently with accepted large commands; browser storage quotas can still reject a save, and the existing close/discard protection remains active.

Each option totals only its own items, separately per currency/rate. Detail, editor and Projects Checklist show those totals, with no combined project Cost/rate total. Project recorded expenses retain their separate per-currency totals and ledger actions. Remaining/Above planned cost is removed because there is no selected option budget to compare against project expenses. Rates never enter monetary expense arithmetic.

## Persistence and migration

Migration 0015 widens project.budget and project_expense.amount to unconstrained numeric and replaces the cost-options validation function. Structural checks, Unicode title handling, IDs, allowed units, item counts, precision and storage bounds remain. The constraint is revalidated. No data UPDATE, backfill, deletion or rewrite of prior migration files is performed. A regression checks both all stored row values and xmin across the isolated migration.

Grouped costs remain authoritative in cost_options. Future grouped writes use neutral compatibility fields cost_items=[] and budget=0.00; existing derived projections are preserved until that explicit grouped save. Legacy single-group input still converts correctly. Compatibility projection changes occur only after canonical receipt hashing and lookup. Draft recovery/unchanged legacy fingerprints retain their exact payload, including older grouped compatibility fields. Version guards, actor-bound receipts, label-only preservation, private attachments and Calendar deletion recovery remain required.

Readiness requires migration 0015 in the checked ledger as well as existing private-file/deletion migrations. The runner verifies hashes of all applied SQL and applies migration transactions under its existing advisory lock. Keep the ordinary build command unchanged; an approved release must execute the checked runner inside secure Production before promotion.

## Acceptance evidence

| Outcome                                | Evidence                                                                                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Full project identity and interactions | task-project-visibility browser tests: spaced/unbroken 80-character names, list/board, phone/tablet/desktop, light/dark/large text, metadata intersections, fallback distinction, rename, keyboard/menu/drag |
| Exact large amounts and draft recovery | cost-precision unit tests plus authenticated cost-large-values browser create/reload/readback and expense isolation                                                                                          |
| Independent totals                     | option-cost-totals browser flow across detail/editor/checklist, mixed-unit option tests, neutral projection and no combined Remaining assertions                                                             |
| Stored values/constraints              | real PostgreSQL integration: wide legacy budget and expense, grouped amounts, preserved migration rows/xmin, technical input boundary and derived carry                                                      |
| Receipt/auth preservation              | unchanged legacy lost-response browser tests; service version/actor/permission regressions; nonempty legacy mutation conflicts                                                                               |
| Responsive large amounts/accessibility | 80-digit values in detail, checklist and editor at 320/390/760/1440, including dark/large text and selected WCAG axe checks                                                                                  |
| Existing website                       | full required unit/PostgreSQL and browser suite, types, lint, format, build, dependency audit and deployed demo audit                                                                                        |

The PR records final exact-source CI, Preview and observed counts. Initial RED evidence reproduced clipping and missing independent totals; numerical/SQL tests reproduced the old size limits. Theme tests await finite CSS transitions before measuring stable contrast. An actual low-contrast selected Option button uses the existing accent-ink token after correction. Assertions are not relaxed to hide failures.

## Rollout and recovery

This revision was reviewed, explicitly approved and released with migration 0015. Automatic production alias assignment was held during migration/build/preflight, migration logs and runtime checks were verified, the domain was explicitly promoted and the prior setting restored. The production release record contains exact artifact identities and observed results. Future releases require their own authorization.

After large amounts or neutral compatibility fields are saved, an older application can reject amounts, misread costs or display combined totals contrary to the current contract. Recover with an application that retains large-number/per-option support and legacy guards. Prefer fixing forward; preserve Calendar/private-file deletion recovery and never edit applied SQL. Provider restoration and actual owner Google/Calendar/device delivery are outside synthetic verification; no owner session or organization records are impersonated for tests.
