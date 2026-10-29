# Board Room Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the approved authenticated Board Room, titled “Kalimantan - Power System Projects”, with durable projects, monitoring, CSV imports and private document review.

**Architecture:** A separate native Next.js `/board-room` area uses Evolve authentication, PostgreSQL and private attachments. Typed domain validation and CSV parsing are shared by server and client; database services enforce admin permissions, versions, atomic imports and file review freshness. Read endpoints return bounded pages plus portfolio-wide aggregates.

**Tech Stack:** Existing Next.js 16, React, TypeScript, Drizzle/PostgreSQL, Zod, Playwright; no additional product dependencies.

**Spec:** docs/superpowers/specs/2026-10-23-board-room-design.md

## Global Constraints

- Ten admin-named shared stages; only admin mutates data.
- Primary categories: Pembangkit, Transmisi, Gardu Induk; multiple admin-created classifications per project.
- Year-only schedules; capacity plus preset/custom unit; HTTP(S) links.
- Year counts above stage counts; category rows align; all filters connect timeline, table and charts.
- Private documents require explicit admin validation; ready-file changes invalidate review.
- CSV preview merges by Project ID, preserves omitted/blank fields and existing stages by default; 5 MiB/5,000 rows per import.
- Separate Board Room records; no deployment or production data migration without release authorization.

## Review Focus

- Concurrent stage edits/Undo must fail stale versions rather than overwrite later data.
- Ready-file add/remove races must invalidate review and reject stale review requests.
- CSV reimports/duplicate IDs/blank fields must not duplicate or erase existing projects.
- Uninvited/disabled/member clients cannot bypass authorization or mutate through direct HTTP requests.
- Many records and uncommon/custom units must retain correct counts without mixing capacities or rendering every record.

## Task 1: Domain and CSV contract

Files: src/lib/board-room/model.ts, csv.ts; tests/board-room.test.ts.
Interfaces: ProjectValues/projectSchema; parseProjectCSV(source,mapping); mergeImportedProject(existing,patch,updateStages).

- [x] Write tests for bad years/ranges/links/capacity, CSV quotes/duplicates/mapping/blank preservation/stage override.
- [x] Run the tests red, implement schemas/parser/merge, rerun green.

## Task 2: Database, services and private files

Files: migrations/0017_board_room.sql; src/lib/db/schema.ts; src/lib/board-room/service.ts; existing attachment entity integration; src/app/api/board-room/route.ts.
Interfaces: queryBoardRoom(actor,query), boardRoomCommand(actor,input), boardRoomDetail(actor,id).

- [x] Add independent project/category/junction/config/history records and indexed queries with pagination/aggregates.
- [x] Enforce active membership/admin, CSRF, optimistic versions and serialized atomic CSV preview/commit checks.
- [x] Extend attachment authorization and database trigger invalidation; ensure only admin uploads/deletes/reviews Board Room documents.
- [x] Test durable CRUD, members denied, stale mutations/imports/reviews, actual private file lifecycle, aggregate counts.

## Task 3: Native dashboard and workflows

Files: src/app/board-room/page.tsx; src/components/board-room/*; src/app/board-room.css.
Interfaces: consumes the typed API, query snapshots and command results; uses existing uploadAttachment pipeline.

- [x] Build exact approved heading and compact responsive sidebar, yearly/category blocks, stages, search/filter state, timeline/table, charts and pagination.
- [x] Implement expanded stages/Undo, project form, category/stage settings, real file upload/download/removal/review and history.
- [x] Implement mapped CSV preview/commit, downloadable templates and filtered export; refresh all dependent views after mutations.
- [x] Include loading/error/empty/conflict states, keyboard navigation and reduced motion.

## Task 4: Verification and review

Files: tests/board-room.integration.test.ts; e2e/board-room.spec.ts; docs/BOARD_ROOM_REVIEW.md.

- [x] Run typecheck, lint, domain/integration tests, build and relevant existing regression suites.
- [x] Exercise actual authenticated admin/member UI, origin checks, persistence, import/error/Undo, document validation and responsive layouts with disposable records.
- [x] Dispatch an independent code reviewer per requesting-code-review; repair material findings with reproducing tests.
- [x] Commit implementation and document measured verification and remaining limits. No unsupported perfection or production-verification claim.

## Execution ledger

User approved the design and explicitly requested complete implementation; continue execution without another approval round. Existing checkout is isolated; preserve unrelated edits. Prototype code is a visual reference, not the production persistence layer. Native execution with a fresh independent final review.

Completed 2026-10-23. Implemented the native authenticated application and additive migration 0015. Independent review findings were repaired and covered by regressions: canonical JSONB import comparison, complete paginated import diffs, filter/mutation races, modal Undo refresh, timeline start-year bounds, optional categories, readable project links, and no-op stage updates.

Verification: typecheck and full ESLint passed; all 156 domain/integration tests passed; production build and 37 Playwright workflows passed across Board Room, uploads, file management, entity deletion and the existing workspace. Browser checks include 320/390/768/1440 px layouts, light/dark WCAG AA scans, keyboard and unsaved-form behavior. See [review evidence](../../BOARD_ROOM_REVIEW.md). No production deployment or production migration was performed.

Release reconciliation: the unreleased Board migration was renumbered from 0015 to 0017, preserving its SQL, after checking that production already contains cost precision 0015 and task ranges 0016.
