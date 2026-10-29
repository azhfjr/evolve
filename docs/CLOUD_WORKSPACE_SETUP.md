# Evolve cloud workspace setup

## Repository and release boundaries

Repository: `https://github.com/azhfjr/evolve.git`. Vercel project: `evolve`, production branch: `main`. Both applications live in one Next.js checkout.

The initial source synchronization uses a current-tree snapshot atop the existing GitHub history. It excludes ignored credentials, `.env.local`, `.vercel`, database contents, uploaded local files, browser sessions, dependencies and build output. Earlier local implementation history is retained in the development workspace rather than uploaded as unreviewed historical objects.

Git-triggered builds do not authorize publication. Keep automatic production-domain assignment held. Prepare, verify and share a working demo before promoting a final production build. Repository synchronization does not change the production database or publish a new application release.

## Repeatable development setup

Use Node.js 24 and npm. From the repository root:

```sh
npm ci
cp .env.example .env.local
# Configure local settings securely. Do not overwrite an existing .env.local.
npm run db:local
npm run db:migrate
npm run test:db:prepare
npm run dev
```

The copy command is for a fresh checkout only. Preserve existing local configuration, credentials and database volumes. `db:local` starts/reuses the guarded PostgreSQL 17 container on `127.0.0.1:54329`; it refuses to replace unrelated database configuration. Docker must be available. For the embedded development fallback, follow the main README; full database/browser verification needs PostgreSQL.

Open port 3000 through the cloud host's supported port-preview control. `/demo` uses demonstration data; `/workspace`, `/app` and `/board-room` require authentication. Do not introduce login bypasses for hosted demos. Google OAuth requires securely configured credentials and an authorized callback origin.

## Managed environment configuration

The Cloud Environment runtime plugin reports readiness and network policy. It does not expose the separate Onboarding: Setup configuration action in this session. Host-level configuration changes must use the supported environment configuration UI/workflow; package installation and project setup in this checkout are separate operations.

At setup inspection, the managed environment was running and connected, unrestricted HTTP policy was enforced, and the existing `VERCEL_TOKEN` binding was ready for `api.vercel.com`. No new host-level secret bindings or network policies were created. Preserve injected proxy settings and CA trust. Never print credentials or commit secret-bearing environment files.

Use local generated authentication secrets for local development; configure Google OAuth, Blob and Calendar credentials only when those integrations are needed. Do not copy production database credentials into development. A configured integration is not proof that every API call is authorized.

## Verification

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

Database tests use disposable guarded targets. For browser verification, install the required Playwright browsers/system dependencies and run suites sequentially when they share `.next`. See the main README and individual Playwright configurations for scale and cross-browser runs. Runtime dependency installation and local smoke checks do not establish a successful remote GitHub Actions run.

Before pushing, check `git status`, review the staged file list, scan for credentials and keep `.env.local`, `.vercel`, `.data`, test sessions and production exports ignored. Before release, rerun required gates, check the exact held build, share the demo and retain a rollback target.
