# Approved ABC implementation — verification

**Production update:** The user subsequently authorized deployment. See [verified release](release/deployment.md). The scope statements below describe the implementation phase before that authorization.

Scope: R1–R4 implemented; R7 and affected R8 implemented; R5/R6/R9 investigation only. Base a9e8aa9. No database migration, production data mutation, permission change, feature deletion, remote push or deployment.

## Behavior

- Incomplete template drafts are bounded, account-scoped, expire after seven days, preserve the base version and require explicit Restore/Discard. Save-to-server validation remains strict. Dirty navigation is guarded; blocked-storage history navigation restores the editor before asking to discard. Current-section navigation is a no-op. Logout invalidates cross-tab/queued persistence using BroadcastChannel and a non-sensitive storage marker.
- Shared requests handle network, gateway, JSON, abort and status failures without raw parser errors or automatic mutation retries.
- Notifications have independent pending/error/retry states; reading a notification does not complete work.
- Geographic Map, Project–Asset Connections, Project Fields, Import & Workflow Guides, Task Templates and Template Library use existing routes/IDs. CSV guidance derives its column count from PROJECT_HEADERS and uses Project ID.
- Template heading/control layout, native guard dialog and notification error rows reuse existing components/tokens.
- CI adds twelve isolated suite/browser jobs. Test-database resets cannot overlap across those jobs. Actual GitHub Actions execution is NOT RUN.

## Review and verification

One independent fresh-context review found three important recovery problems: failed-storage Back navigation, same-section release disabling subsequent protection, and another tab recreating drafts after logout. Each regression was observed RED then GREEN (3/3 closure). No review minors were deferred. During closure, a fourth regression was reproduced and fixed: optimistic notification state must yield to a fresh unread response. The dedicated test was observed RED then GREEN.

Final expansion/regression closure: Chromium22/22 and Firefox22/22. Domain/integration346/346 PASS; type checking, lint and formatting PASS. Existing additional runs: costs8/8; connected14/14; regional9/9; final navigation12/12; native Chromium200% zoom1/1 across both apps. Regional suite includes36-route inspection,390/1440px,both themes and large fonts; affected template/guard screenshots cover320,390,768,1024,1440,1920px and both themes. Axe checks cover affected dialog and existing financial/overview journeys; this is not a WCAG certification.

WebKit launch was retried and is BLOCKED by missing libGLESv2.so.2. The runtime user is unprivileged and the package is not available from the current local apt index. No system dependency was installed and no substitute graphics library was injected.

## Limits and rulings

- Production/deployment and live CI were declined by the reviewer and remain NOT RUN: no production/push authorization. Local tests cannot establish environment-specific live behavior.
- Vercel observability access, actual feature adoption, production historical record counts and retention requirements remain investigation limits. No permission expansion or feature deletion is inferred; later evidence may require revising those proposals.
- Earlier RED/harness failures remain in local logs; only passing closure runs count toward acceptance. Browser logout fixtures clear the requesting context cookie rather than revoke a shared test session.
- User-approved UI scope is limited to affected components; no whole-site redesign, chart replacement or claim of exhaustive bug elimination is made.
- Keep changes on the existing work branch. Schema and API server response contracts remain unchanged. Code can be reverted without data rollback. Production publication requires separate approval.

Investigation deliverable: [R5/R6/R9](investigations.md).

## Test evidence

| Check                                                    | Actual result                             | Log                                                                          |
| -------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| Domain/integration                                       | 346/346 PASS                              | /tmp/abc-domain-final.log                                                    |
| Types / lint / formatting                                | PASS                                      | /tmp/abc-types-final.log; /tmp/abc-lint-final.log; /tmp/abc-format-final.log |
| Expansion + audit fixes, Chromium                        | 22/22 PASS                                | /tmp/abc-chromium-final.log                                                  |
| Expansion + audit fixes, Firefox                         | 22/22 PASS                                | /tmp/abc-firefox-final.log                                                   |
| Financial journeys                                       | 8/8 PASS                                  | /tmp/abc-costs.log                                                           |
| Connected workflows/documents/drafts                     | 14/14 PASS                                | /tmp/abc-connected.log                                                       |
| Regional/chart/route/responsive                          | 9/9 PASS                                  | /tmp/abc-regional.log                                                        |
| Final sidebar/management navigation                      | 12/12 PASS                                | /tmp/abc-navigation-closure.log                                              |
| Recorded native Chromium200% zoom, both apps             | 1/1 PASS                                  | /tmp/abc-zoom.log                                                            |
| Dependency audit                                         | 0 advisories                              | /tmp/abc-audit.json                                                          |
| WebKit                                                   | BLOCKED at launch; missing libGLESv2.so.2 | /tmp/abc-webkit.log                                                          |
| Live CI, production deployment/mutation, scale benchmark | NOT RUN                                   | Outside current execution/verification scope                                 |

Each browser suite starts through the configured production build/start command; the final source production build succeeded before Firefox closure. Screenshots at all six widths remain in test-results; representative affected-UI evidence is retained in [evidence](evidence/). These are screenshot/computed-layout checks and manual inspection, not a claim that a pixel-diff regression baseline exists for every page. Earlier generated release screenshots were preserved under test-results and their tracked baseline files restored.
