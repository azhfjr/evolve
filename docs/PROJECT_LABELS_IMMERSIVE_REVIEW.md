# Project labels and immersive Connection

18 October 2026. Project-owned labels are retained. The revised Connection graph follows **Project → its own Task**, with the hashtag used as a filter. This review describes the implementation candidate; production remains on the previously approved deletion release until this candidate is approved.

## Behavior

Only administrators edit Project labels, through the Project form or the Project's label action in Connection. Task creation/editing displays inherited labels without independent label controls. Moving a task changes its effective labels; No project has none. This includes archived tasks, duplicate/recurring tasks, CSV import and templates. Saved task drafts retain their other contents while retiring their old independent labels. CSV's sample uses a Project column; nonempty legacy Labels columns return row errors rather than silently assigning independent tags.

Label input accepts `#Design System`, normalizes it to `design_system`, and displays `#design_system`. NFKC normalization, lowercase, whitespace-to-underscore and deduplication share one implementation. New labels allow up to 30 visible Unicode characters, with ten unique labels per Project. A lowercase expansion such as `İ` is counted as one visible character. Bare hashtags are rejected on new writes. Read paths tolerate previously valid bare hashtags by omitting their empty active name; they preserve longer lowercase expansions without truncation. Existing database label arrays are not rewritten during reads.

Task labels are derived from the current Project on workspace pages, continuation pages, filtered task search, direct task reads, mutation responses and idempotent receipt replay. Stored task-only labels remain in PostgreSQL for compatibility but no longer participate in active labels or Connection. Retried receipts return current records, preventing stale ownership, versions or labels from replacing subsequent edits. Project metadata is canonicalized consistently in JavaScript, while task filtering/counting/pagination remains global in PostgreSQL, including work beyond the initial 500 tasks.

## Map and interaction

The hashtag filters matching Projects and Tasks. Each Project is a prominent graph node connected only to its own matching Task nodes. There are no hashtag or category nodes in the canvas. The server returns contextual parent Projects when search, a Task-only filter or pagination excludes the parent from the result page. These contextual parents do not increase the result count or appear as additional list results. Queries still filter/count globally before pagination.

A deterministic radial cluster layout packs projects into a balanced area. Nodes and SVG edges share world coordinates. Dragging a node updates its connected edges; dragging the background pans the camera. Wheel zoom stays anchored under the pointer; two-finger pinch zoom also supports midpoint movement. Pointer movement is published at most once per animation frame, and there is no idle force simulation. Fit map resets manual positions and fits all displayed nodes, including their labels, with a margin. It fits the current result page, not unloaded tasks. Below 36% zoom the canvas provides an overview; tapping a node zooms to its detail without opening it. Node navigation uses buttons at interactive zoom, avoiding overlapping controls in dense overview maps. The List view and toolbar remain available to keyboard users. Mobile stacks clusters; wide screens use balanced columns. Label editing lives in a fixed-size contextual footer action. Full titles appear in the selection footer, browser tooltips and the accessible List view.

Enter fullscreen requests the native Fullscreen API directly from the click. Unsupported/rejected requests use the viewport modal. Camera zoom and world center survive entry, exit and viewport resize. Escape/browser fullscreen exit closes the modal, and opening a Project, Task or label editor exits fullscreen first. Focus returns to the fullscreen control. Keyboard arrows/PageUp/PageDown pan; +/- zoom; Home/0 fit. Focusing an offscreen node reveals it; focus/hover highlights its immediate Project/Task neighbors. All controls remain available on narrow and short screens. The canvas consumes gestures only inside its region; other page scrolling remains available. No continuous layout animation is introduced.

## Review findings addressed

- Browser regressions cover duplicate pointerup/lostcapture cleanup so dragging a node cannot open it. Graph styling overrides the older file-workspace card positioning rule; a fit assertion verifies actual DOM bounds rather than only camera math.
- Initial task draft/command/demo tests reproduced independent task-label behavior before its removal.
- PostgreSQL regressions reproduced raw-label continuation pages and stale idempotency receipts before correction.
- Canonicalization tests exposed JavaScript/PostgreSQL Unicode differences, bare-hashtag searches and legacy boundary values. Queries now use the same Project keys without destructive data conversion.
- Browser tests reproduced focus loss after fullscreen exit. During the modal's closing render, two map copies shared refs. Rendering the portal's map only while immersive is open prevents the closing copy from clearing the embedded map's refs. Geometry observation is bound to the actual mounted canvas, including portal mounting and viewport resize; closing a nested label editor also restores a stable map control.

## Acceptance and release

The exact source, observed test results, preview URL and CI run are recorded in the associated pull request after validation. Coverage includes authenticated UI → API → PostgreSQL → reload, read-only inheritance, project moves, archive relabeling, permissions, failed-response retries, canonical search, global pagination, native/fallback fullscreen, browser exit, late requests, focus and retained map controls. Existing files, Cost/Expense, deletion and Calendar regressions remain required.

No new migration is required; production must retain migrations 0001–0011 and the existing private-file and Calendar cleanup protections. This change does not delete organization tasks, projects, costs, files or their stored legacy label arrays. Reverting application behavior would reactivate legacy task labels, so any rollback needs an explicit decision about that semantic change.

Browser automation uses Chromium and disposable databases/isolated demo data. It does not establish physical-device Safari/Firefox behavior, screen-reader acceptance, field Core Web Vitals or sustained concurrency capacity. Real Google consent and Calendar delivery are unchanged and are not impersonated by fixture sessions. UI-only previews do not prove production database connectivity.
