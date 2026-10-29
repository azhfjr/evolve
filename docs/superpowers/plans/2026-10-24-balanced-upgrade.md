# Evolve Balanced Upgrade Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement and verify each deliverable. User approved the recommended balanced package; proceed without another planning approval.

**Goal:** Make Evolve actionable at entry, make Board Room reviews accountable, and connect independent project records through RUPTL Code.

**Architecture:** Preserve the native Next.js modular monolith, shared identity/theme, admin-only Board mutations, and isolated room data. Extend Board JSON payloads compatibly; use authenticated read-only links between rooms, never implicit synchronization.

**Tech Stack:** Existing Next.js 16.4.1, React 19, TypeScript, Drizzle/PostgreSQL, private Vercel Blob.

**Spec:** Approved balanced recommendations in this conversation. Recommended defaults apply: actionable Home and independent RUPTL links.

## Global Constraints

- Keep primary categories Pembangkit, Transmisi, Gardu Induk; do not restore custom categories or retired task dependencies.
- Keep year-only Board planning, exact capacity units, human document validity, admin-only stage edits.
- Preserve settings, sidebar geometry/interaction, existing saved views/templates/notifications and file isolation.
- No new providers, billing, access expansion, automatic production restore or destructive migrations.
- Existing production release authorization continues; stage and verify changes before normal promotion.

## Review Focus

- Historical Board JSON without new fields must remain readable and importable.
- File metadata changes must not silently establish validity or progress review freshness.
- RUPTL matching must neither overwrite records nor select an arbitrary duplicate.
- Home counts/links must be computed from actual authenticated data and handle empty portfolios.
- Concurrency must reject stale mutations and preserve independent review fields.

## Deliverables

### Task 1: Focused entry and daily work

Files: workspace-home.tsx, workspace-experience.ts, new focus helper/component/CSS, Locker overview component, related tests.

- [x] Test actual attention counts and date/time-zone boundaries against disposable DB or pure helpers.
- [x] Add actionable Home cards/links for overdue/my work, Board reviews and missing data, and preserve room entries.
- [x] Put Locker daily work before the large connection map; retain accessible expandable map and existing saved views.
- [x] Verify desktop/phone, empty state and role behavior.

### Task 2: Accountable Board reviews and focused dashboard

Files: board-room/model.ts and service.ts, Board form/detail/dashboard, new project-health helper, tests.

- [x] Test backwards defaults, dedicated progress-review freshness, stage jump/reversal reasons and member rejection.
- [x] Add responsible person/contact text, progress review note/time independent of generic updates, required-document checklist and admin review notes.
- [x] Show attention filters/queue and missing metadata warnings, preserving yearly category splits and stage counts.
- [x] Keep file changes invalidating human validity; checklist completeness enforced when specified.
- [x] Verify concurrency, reports/readback and responsive layouts.

### Task 3: Import and meeting evidence

Files: new Board import-history module/route/UI, import dialog, reports UI, tests.

- [x] Add authenticated import history with counts/actor/time and saved column mappings; no misleading rollback control.
- [x] Add dated, filtered meeting report export/print containing stage and human validity, no mixed-unit sum.
- [x] Test malformed input, member read-only, stale preview and filtered report correctness.
- [x] Record reversible-batch/file-version requirements as follow-up if they require a separate retention/migration policy; do not claim implemented.

### Task 4: Cross-room project links and operational evidence

Files: new authenticated cross-room API/helper/component, Board detail, Locker project detail, tests, release documentation.

- [x] Test exact RUPTL matching, absent/duplicate matches, inactive membership and independent writes.
- [x] Link both project detail surfaces; do not synchronize fields or create records automatically.
- [x] Document existing quota thresholds, monitoring/backup/restore procedures and dependency advisory honestly; validate safe local restore if available.
- [x] Run types/lint/domain tests/build, browser journeys, independent review, repair and stage/live smoke.

## Delivery ledger

- Baseline: clean branch work at 407461f; deployed application source 4a01b68. Prior complete suite 205 domain/integration, 258 browser tests.
- Plan interpretation: implement connected core balanced product changes now. Optional external integrations, IAM delegation, automated migration/storage retention, and infrastructure changes remain outside this approval's operational boundary.

- Task 1: complete — live focus counts/links, daily-work-first layout; domain and browser tests passed.
- Task 2: complete — compatible JSON review fields, checklist gating, attention filters; browser role/reload/phone journeys passed.
- Task 3: complete — personal mappings, import journal, dated reports; final browser journeys passed. Automatic rollback/retained versions remain explicitly outside this release.
- Task 4: complete locally — independent RUPTL lookups, shared quota warnings, safe recovery drill, 228 domain tests and final 36-case browser regression passed. Release evidence pending deployment below.
- Final review ruling: keep omitted stage reasons compatible for existing admin API clients; the interface requires reasons and journal entries identify missing legacy reasons. Enforcing omission now would break existing supported clients; this is not an authorization bypass.

- Release: production verified 24 October 2026 21:16 (UTC+7); exact application source `f0984e452380536ccf6745df9b43b0ddaf856bc8`, deployment `dpl_ymH9xxgSC4N7NJuYNBhT6gdr1HnM`; staged/live checks passed, temporary review access revoked.
