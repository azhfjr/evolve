# Production release — Approved ABC

**Live:** https://evolve-rensist.vercel.app

- Deployment: `dpl_9jRskUemon5E3Wgk1RS13hr8cUHS`; target production; status READY.
- Source commit: `8d7cf2a421e17a1780b678a44fc94a86f55a17ae`. The exact held production build was promoted without rebuilding.
- Before promotion:23 health/route/private-access/geometry checks passed.
- After alias confirmation and temporary-access removal:23 public checks passed;16 hashed build asset paths match the held build. No browser exception was observed in these smoke checks.
- Temporary share credential revoked and its local file removed. Original automatic domain assignment restored to true.
- Rollback target: `dpl_8M7G4rkAZuBRpaYxBnbCdbXRd6bm`. No database migration or synthetic project/file creation occurred.

## Verification limits

Signed-in production mutations were NOT RUN; authenticated behavior is backed by the recorded local Chromium/Firefox/domain tests. WebKit remains blocked by the missing local libGLESv2.so.2 library. Runtime-error API access returned403, so no platform-wide clean error-log claim is made. GitHub Actions remote execution remains NOT RUN; this deployment used the authenticated Vercel API after connector project lookup failed for the explicit scope.

R5/R6/R9 remain investigation deliverables, not newly enabled features. This release publishes R1–R4, R7 and the affected R8 implementation.
