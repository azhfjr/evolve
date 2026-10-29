# Coverage inventory — regional/charts release

Status: final suite in progress; references are test responsibilities, not an unconditional pass claim.

| Surface                  | Routes / states                                                                      | Evidence owner                                                   |
| ------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Chooser / shared Home    | Home, app order, personal focus, search, settings navigation                         | balanced-audit; board-dashboard; workspace-focus tests           |
| Locker work              | Overview, all/my tasks, list/board/calendar, inbox, team, activity                   | principal routes + full Chromium task/calendar/navigation suites |
| Locker projects          | Canonical project selection, old-link archive handoff, task relations                | connected + connected-transition + project-room-links            |
| Board portfolio          | Filters, stages, years, timeline/table, summary placement, chart/drilldown           | board-dashboard; shared-interactions; balanced-audit             |
| Board project hub        | Overview/assets/tasks/documents/activity, create/edit, review and conflict           | connected + board-room + board-evidence                          |
| Assets / imports         | Database, detail, assignment/reassignment, template, mapping/preview/merge/conflict  | connected-assets + connected browser workflows                   |
| Maps                     | Regional polygons/filter/table/source; project–asset graph/list/pagination           | regional-map; regional-review; connection/connected suites       |
| Reports / export         | Complete project scope, region, exact units, printable output                        | regional integration; board report/export tests                  |
| Documents                | Create/upload/cancel/retry, labels, revisions, private view/download/delete, ZIP     | document-workflows + document-versions + storage suites          |
| Shared Files             | App buckets, quota, pending/deleting bytes, tables, admin boundaries                 | shared-storage and file-management suites                        |
| Settings / admin         | Accounts, preferences, team, activity, stage settings, templates, operations/archive | principal routes + settings/operations/sidebar suites            |
| Responsive/accessibility | Six widths, two themes, font scales, reduced motion; native200% zoom                 | balanced-audit; regional-review; native-zoom; axe                |

## Principal route inventory

- `/workspace`
- `/app`
- `/app?section=tasks`
- `/app?section=tasks&view=calendar`
- `/app?section=projects`
- `/app?section=connection`
- `/app?section=mytasks`
- `/app?section=inbox`
- `/app?section=team`
- `/app?section=activity`
- `/app?section=templates`
- `/app?section=files`
- `/app?section=settings`
- `/board-room`
- `/board-room?section=projects`
- `/board-room?section=assets`
- `/board-room?section=database`
- `/board-room?section=connections`
- `/board-room?section=reports`
- `/board-room?section=documents`
- `/board-room?section=quality`
- `/board-room?section=settings`
- `/board-room?section=people`
- `/board-room?section=activity`
- `/board-room?section=preferences`
- `/board-room?section=templates`
- `/board-room?section=files`
- `/workspace/settings?section=files`
- `/workspace/settings?section=preferences`
- `/workspace/operations`
- `/workspace/archive`
- `/board-room/projects/`

The final project entry uses the disposable fixture ID. Calendar uses section=tasks&view=calendar; it is not an unsupported section alias. Some legacy project routes intentionally redirect to canonical Board/archive destinations.

## Explicit limits

- Browser sessions use disposable authenticated fixtures; a fresh real Google consent and live Calendar-provider write are not exercised.
- Production validation uses health, access boundaries and static-geometry checksum; no synthetic live files/records.
- Automated axe covers representative pages; it does not prove every screen-reader/browser combination.
- Scale timings describe the recorded fixture environment, not production-wide capacity guarantees.
- Boundary vintage2017 is disclosed; original geometry retained, no project coordinates inferred.
- Historical production records are not altered/downloaded for tests. Seeded/legacy test records validate compatibility; they are not presented as full historical production backtesting.
