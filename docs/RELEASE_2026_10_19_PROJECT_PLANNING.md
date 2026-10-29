# Project planning, Cost and hierarchy release — 19 October 2026

Production: **https://evolve-rensist.vercel.app**. Owner approved the reviewed revision with “Looking great. Finish it.” Live verification completed at `2026-10-19T06:41:47.895821+00:00` UTC.

## Released artifact

- Application source: `276c97168778357a2b9a6e011d63dcdf5fa5a8cb`.
- Production deployment: `dpl_CU2iKVFWUAtpS859TsHJLjgotdsk` (`evolve-h0f6qa9n1-jarjirjor777-5316.vercel.app`), target Production, observed READY.
- Reviewed Preview: `dpl_4i2n3rcjP1fwRyWvE9pnHDm7sCaL`.
- Reviewed 224-file digest: `ac4a100ed423b6ff8bbfcddbae5453960fb5901d0d65238ce9004009b72a13e0`.
- Production 224-file digest: `857caf29dc868fd50c7da670332c78c51c1a8052911a28d09d8d377dc3a2fadf`.
- The only uploaded configuration override was `vercel.json` buildCommand: `npm run db:migrate && npm run build`. Ordinary repository builds remain `npm run build`; application source and dependencies match the reviewed artifact.
- Domain assignment was held on `dpl_i3LtMHPhjCcVH33cKvMqv5sipN8T` during migration/build/preflight, then explicitly promoted (HTTP 201). The domain maps to `dpl_CU2iKVFWUAtpS859TsHJLjgotdsk`. `autoAssignCustomDomains` was restored to its original `true` setting.

## User-visible behavior

Connection follows Label → Project → its own Task, with fit, pan/zoom, native/fallback fullscreen and focus restoration. Project labels browse existing global labels and support creating new ones. Projects offer Pembangkit, Transmisi and Gardu Induk categories.

Project Options are managed after Description, with optional Planned COD (Not set or 2026–2040). The Cost section follows those groups. All options contribute to exact separate IDR, USD, cUSD/kWh and Rp/kWh totals; energy rates never enter monetary expense/budget/Remaining arithmetic. The Projects portfolio retains Cards and adds an expandable Checklist exposing Project → Option → Cost details, filters, search and per-unit totals. It has no stored completion-checkbox state or selected alternative scenario.

Draft recovery, existing administrator permissions, version/receipt checks, legacy grouped/ungrouped retries, private attachments and durable Calendar deletion recovery remain active. Renaming an option retains stable cost identifiers and values. See [full behavior and acceptance evidence](PROJECT_OPTIONS_HIERARCHY_REVIEW.md).

## Observed validation

| Check                                                                                | Actual result                                                                                                                          | Scope                                                                             |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [Exact-source Quality CI](https://github.com/azhfjr/evolve/actions/runs/39209381773) | 144 unit/PostgreSQL and 154 browser cases passed; zero failed, flaky or skipped                                                        | Disposable PostgreSQL and synthetic local sessions; actual production build       |
| CI source identity                                                                   | Merge `5b2d3d86c99f24fb0b426b6cc6a5ccac64ade4f9` tree `0e1c90afb6aa13779f0f3866e5edcb6486be6f5d` equals the application source tree    | Includes type checking, lint, formatting and dependency audit (0 vulnerabilities) |
| Reviewed Preview                                                                     | 29 browser cases plus 96 layout/page/navigation/accessibility states passed                                                            | Isolated browser demo; no Production bindings copied                              |
| New Production preflight                                                             | 29 browser cases passed, no unexpected/flaky/skipped results                                                                           | Immutable Production artifact before domain promotion; demo data only             |
| Live health                                                                          | HTTP 200; database connected, schema current, authentication configured                                                                | Custom production domain after promotion                                          |
| Authorization/CSRF                                                                   | Eight private endpoints returned 401 anonymously; forged mutation origin returned 403                                                  | Workspace/tasks/export/connections/calendar/events/files/maintenance              |
| Live runtime                                                                         | Login/demo load; private app redirects to login; demo label inheritance and task edit persist across reload; no page errors            | No owner session manufactured and no organization CRUD performed                  |
| Google initiation                                                                    | HTTP 200 to accounts.google.com with state, PKCE and correct production callback                                                       | Initiation only; no fresh real-account consent or token exchange                  |
| Live UI                                                                              | Eight Checklist/project-form states at 1440, 390, 320 and 568 px passed; no page overflow, page errors or selected WCAG axe violations | Light/dark Chromium; browser demo costs in all four units                         |

## Migrations and recovery

The checked runner inside Vercel's secure Production build verified unchanged hashes for migrations 0001–0011 and applied 0012–0014. Fourteen migration log entries were observed. No fixtures, data backfill or organization record deletion were performed.

| Migration                                  | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `0012_project_cost_options_categories.sql` | `4fa166f2324e710cddbff9edf9adae8a94f197fdb2396c989d180f41bbd7aac4` |
| `0013_project_cost_title_unicode.sql`      | `9a36ab758015af54dd71f670e5d7165e7d0664ea8098b4c455fb7c4801c37bc9` |
| `0014_project_planned_cod.sql`             | `8785238fb4b174b6d10fff9dad7219599c360e763bb548fff67c628cdb0658c8` |

Migration 0012 adds nullable category/cost_options and bounded validation. Migration 0013 aligns title whitespace/Unicode handling and revalidates the cost constraint. Migration 0014 adds nullable planned_cod_year with an integer range check. Existing projects remain unset; omitted COD updates preserve it and explicit null clears it. Each migration uses the existing advisory lock/transaction/hash ledger. Applied SQL files must not be edited.

Keep the previous deployment as a reference, but after grouped costs are written, recover using an options-aware application with the compatibility guard/projection. An older writer can make grouped values inconsistent. Prefer fixing forward; preserve Calendar deletion recovery and private draft/file tombstone protections. Do not automatically undo schema or restore a database.

## Practical limits

These checks do not prove fresh real-account Google/Calendar delivery, physical Safari/Firefox/iOS/Android behavior, screen-reader acceptance, field/load performance, external alerting or backup restoration. Existing user confirmation of a connected Calendar account remains valid; device reminder delivery was not observed. Production provider quotas and documented feature limits remain unchanged. Cloud environment Save/Publish and fresh-task restoration are separate from this completed website release.
