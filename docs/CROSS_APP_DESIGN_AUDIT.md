# Cross-app design and CSV audit — 24 October 2026

## Outcome

Locker Room remains the design reference. Both native rooms now share the body/input/helper type scale, content spacing, logo treatment and interaction colors. Board Room retains Overview, Projects, Documents, Reports, Database, Categories and Stage settings. Workspace navigation reads **Home** throughout.

- Inter body copy uses the existing 14 px token; supporting copy uses the existing 12 px token. Phone inputs retain a 16 px minimum. Board’s tiny timeline/caption overrides were removed. Equivalent sidebar identity, profile and utility controls have measured matching font sizes and padding. Main headings follow the existing 26/24 px responsive scale.
- Board uses the same Logo component and matching 23 px wordmark, mark size, text color and tagline treatment as Locker Room. Room names remain distinct.
- Neutral surfaces, selected states and hover colors resolve from the shared theme. Dark highlights no longer receive light-only backgrounds. Active project-stage buttons use an on-accent foreground with a tested WCAG AA text contrast ratio.
- Theme colors change atomically, avoiding transient low contrast while foreground/background colors previously interpolated independently. Layout, drawer, focus and shadow motion remain available with reduced-motion support.
- Larger year cards retain aligned category/count columns and horizontal navigation instead of shrinking readable text. Main feature menus and prior sidebar race/resize fixes remain intact. Project share links use client navigation.

## CSV parity

The template, example, importer mapping, exporter, generated documentation and collapsible in-app guide derive from the same typed field registry. See [the field guide](BOARD_ROOM_CSV.md). Run `npm run templates:board-room` to regenerate artifacts; tests detect header drift.

All 14 supported columns include RUPTL Code, project name, primary/custom categories, capacity/unit, start/COD years, description, location, links/link labels, current stage and completion. Legacy Project ID and Category headers remain accepted. Stage 0 represents Not started; completion requires stage 10. Existing workflow/completion updates remain opt-in. Blanks preserve existing values and absent projects remain untouched.

Exported lists preserve punctuation, repeated URLs, empty labels and label order. Legacy semicolon lists remain accepted, including bracketed category names. Preview compares actual values and displays arrays unambiguously, so different lists cannot hide behind identical joined text. Integration tests verify preview/commit/export, retained workflow protection and rejection of document-validity mapping. Files, review status, reviewer identity and other server metadata are intentionally managed in the app.

## Executed verification

| Check                                  | Result                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| TypeScript and route generation        | Passed                                                                                  |
| Full zero-warning ESLint               | Passed                                                                                  |
| Domain/integration suite               | **201 passed**, zero failures                                                           |
| Full browser audit                     | **244 scheduled**: 238 passed, four findings, two serial cases deferred after a failure |
| Affected-workflow regression           | **54 executed**: 53 passed; one measured Theme-label font mismatch corrected            |
| Final visual/navigation/CSV regression | **25 passed**, zero failures, after production-mode build                               |

All four full-audit findings were exercised successfully in the affected-workflow regression: a real transient theme-link contrast defect, two outage mocks that could intercept unrelated overview startup requests, and an archive test issuing a window shortcut before its listener was ready. Outage mocks now target the intended failure/retry flow; archive restoration opens Quick find through its visible control. Dedicated keyboard-shortcut coverage remains and passed. No assertions were disabled. The two deferred serial cases passed in the subsequent regression.

Coverage includes real application persistence, role/origin rejection, tasks/drafts, search/archive/restore, labels/maps, exact costs/options, date ranges/time zones, CSV preview/commit/reimport/export, uploads/cancellation/downloads/private files, deletion recovery, saved settings/themes, responsive layouts and WCAG AA scans. Tests ran with disposable synthetic data. They do not establish a new real owner Google authorization-code exchange, live private-file CRUD or Calendar/device delivery. No production user session was manufactured.

An independent reviewer identified ambiguous array previews and active-stage contrast; both were repaired and covered by regression tests. Final read-only review found no important issue in these changes.

## Upstream dependency advisory

`npm audit --omit=dev --audit-level=moderate` reports **one advisory through four package entries**: [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), concerning constrained-collection memory exhaustion in Zod below 4.6.6. The application and authentication validation use patched **Zod 4.6.7**. The affected copy is pinned/bundled through `@vercel/blob 2.8.2 → @vercel/oidc 3.8.10 → @vercel/cli-config 0.3.1 → zod 4.1.11`.

Source review found that the bundled validator consumes local CLI configuration, not application request or uploaded-file data, and found no affected constrained collections in those schemas. This is a limited-exposure upstream finding, not proof of universal non-exploitability. Blob SDK authentication can attempt OIDC/CLI configuration before falling back to the environment token; the environment token alone does not prove the CLI path is bypassed.

The latest Blob version remains 2.8.2; the newer cli-config 0.3.3 still pins the affected Zod version. The suggested automatic fix downgrades the Blob SDK to 2.4.0; it was not applied blindly. An override would not patch the compiled bundled copy. Track the upstream fix and validate private upload/read/delete behavior before a future SDK change. The finding remains visible rather than being suppressed or reported as fixed.

## Release boundary

No schema migration, storage-provider/quota change, paid resource, organization fixture write or permission expansion is included. Release the exact reviewed source with the ordinary build command, verify staged health/access/template headers, then verify the custom-domain mapping and live browser checks. Retain the previous deployment as rollback. Exact deployment evidence is recorded below after publication.

## Verified publication

Live at https://evolve-rensist.vercel.app/board-room, verified 24 October 2026 11:01 (UTC+7). Exact source `715fa08500a8362a1872c691386aed020fa53b3f`, deployment `dpl_Hp4eQKBBVkvrR39MtZ9185hRVnW1`, uploaded digest `226f3e67029c14f8b6f861527a653cc5dbdfe47d1bc58aee615ea150acc0a420`. The custom-domain alias matches the READY deployment. Staged and live health, authentication/origin boundaries, desktop/mobile demo rendering and all 14 CSV headers passed without browser errors. Temporary review access was revoked and automatic domain assignment restored. Previous deployment `dpl_Fku9CwHeNdV2ca2zf5zrmeB1pWSL` remains the rollback reference. The sidebar regressions described in [Board sidebar recovery](BOARD_SIDEBAR_RECOVERY.md) remain covered by the final passing browser run.
