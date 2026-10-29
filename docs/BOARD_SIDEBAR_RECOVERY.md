# Board Room sidebar recovery — 23 October 2026

Board Room’s primary menus are grouped under **BOARD ROOM**: Overview, Projects, Documents, Reports, Database, Categories and Stage settings. Shared navigation, account and theme utilities remain available.

## Reproduced failures and fixes

- The menu measured 155.5 px inside a 234.2 px area because the scroll region’s flex child could shrink. It now fills the available width with the same scroll sizing, scrollbar gutter and navigation-item behavior as Locker Room. Decorative sidebar content no longer displaces the feature menus.
- Collapse waited for a server save. It now responds optimistically and uses Locker Room’s 180 ms sidebar/content transition, with reduced-motion support and rollback after save failure.
- A delayed dashboard snapshot could revert a completed preference save, causing the sidebar to jump back. Accepted snapshots now preserve newer profile/settings versions.
- The responsive server-rendered desktop tree was replaced after hydration by the compact tree. Desktop, tablet and mobile shells now use stable markup and CSS visibility, eliminating that replacement. Resizing an open drawer to desktop closes it and returns focus to the visible desktop navigation control.

## Verification

All three original failing reproductions passed after repair. **25 browser regression workflows passed** covering Board Room, shared navigation/settings, private uploads/reviews, CSVs, access controls and responsive/accessibility checks. The final **four sidebar workflows passed**, including all seven functional menu destinations, immediate collapse before a delayed save, stale-refresh protection, stable responsive sidebar identity, drawer operation and focus restoration. Browser execution builds the production application first. TypeScript and zero-warning ESLint passed. An independent read-only reviewer found no important issue; its desktop focus observation was fixed and tested.

All private workflow fixtures use disposable test databases. No production session was manufactured. This change introduces no migration, storage/quota change or organization fixture data.

## Verified release

Live on https://evolve-rensist.vercel.app/board-room, verified 23 October 2026 19:43 (UTC+7).

Source `9371bc1d3d7141e346385434b2b35f8407200839`; deployment `dpl_Fku9CwHeNdV2ca2zf5zrmeB1pWSL` is READY and confirmed by the custom-domain alias API. Uploaded digest `0584ec6a53b8845b62454e33b86265b0117ef1f7f78f28564f514e8df59252e4` matched deployment metadata. Staged and live checks passed: health ready/current schema; anonymous private APIs 401; forged mutation origins 403; login required for Board/workspace; desktop/mobile public demo without JavaScript errors or horizontal overflow; RUPTL CSV template available. Existing Google login, private storage and schema configuration were preserved. Temporary deployment review access was revoked and automatic domain assignment restored. Previous deployment `dpl_CWh8fs4AR89a2MbGqGg2mURNriiK` remains the rollback reference.
