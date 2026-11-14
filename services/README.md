# services

Non-app services, in their own pnpm workspace ([ADR 0042](../docs/adr/0042-witnesswork-app-domain.md) §4). Nothing here is part of the app: the root `tsconfig.json`, ESLint, Vitest, Prettier's content rules and Metro all leave `services/` alone, and the app's `node_modules` never serves it (this workspace has its own lockfile, `pnpm-lock.yaml`, and its own React).

| Package                        | What                                                                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`marketing`](./marketing)     | The website at `witnesswork.app`: landing page (19 languages), privacy, terms, support, `/get`, and the Help Center with its bundles the app reads                         |
| [`help-search`](./help-search) | The Help Center search API                                                                                                                                                 |
| [`api`](./api)                 | ww-api, the backend API. It is not part of this workspace: it has its own pnpm workspace and lockfile, and its own deploy workflow. See [`api/README.md`](./api/README.md) |

The rest of this page covers `marketing` and `help-search`.

## Environments

Two environments are deployed. Development is local only: `pnpm dev` in a package, and nothing is deployed for it.

|                          | Production                                              | Beta                                                              |
| ------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------- |
| Website                  | `witnesswork.app` (Worker `ww-marketing`, assets only)  | `beta.witnesswork.app` (Worker `ww-marketing-beta`), `noindex`    |
| Help search              | `help-search.witnesswork.app` (Worker `ww-help-search`) | `help-search-beta.witnesswork.app` (Worker `ww-help-search-beta`) |
| Web app that links to it | `https://app.witnesswork.app`                           | `https://beta.app.witnesswork.app`                                |
| GitHub environment       | `services-production`                                   | `services-beta`                                                   |

Beta is always the tip of `main`: every push that deploys Production deploys Beta too.

## Setup

Same Node as the app (the repo's `.nvmrc`) and the same pnpm (`packageManager`). Install from this folder; it doesn't touch the app's `node_modules`:

```sh
cd services
pnpm install
```

Dependencies are pinned to exact versions, and `minimumReleaseAge` (7 days) applies as in the app's workspace.

## Scripts

From `services/`, each runs in every package:

| Command          | Does                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm build`     | `marketing`: the production site into `marketing/dist/production/client`. `help-search`: a dry-run bundle |
| `pnpm test`      | Unit tests, plus the site's content and landing-translation checks                                        |
| `pnpm typecheck` | `tsc --noEmit`                                                                                            |
| `pnpm lint`      | [oxlint](https://oxc.rs) with its default rules, warnings fail                                            |
| `pnpm e2e`       | The site's Playwright suite against its build (build first)                                               |
| `pnpm check`     | lint, typecheck, test, build                                                                              |

## Deploying

[`.github/workflows/services.yml`](../.github/workflows/services.yml) (shown as **Website deploy**) deploys both Workers to each environment:

| Trigger                                                                       | Deploys                                                                                                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Push to `main` touching `services/**` (except `services/api`) or the workflow | Both: Beta (`beta.witnesswork.app`, `help-search-beta.witnesswork.app`) and Production (`witnesswork.app`, `help-search.witnesswork.app`), as two jobs |
| `workflow_dispatch` on `main`                                                 | Beta only: a manual redeploy                                                                                                                           |
| `workflow_dispatch` on any other ref                                          | Nothing: both jobs are skipped                                                                                                                         |

Pull requests and pushes to `main` are checked by the **Checks** workflow ([`tests.yml`](../.github/workflows/tests.yml)): its website job runs lint, typecheck, unit tests and the production build on every pull request, whatever paths changed, and deploys nothing.

Production only ever comes from a push to `main`. Every deploy run installs with the frozen lockfile, runs lint, typecheck and unit tests, and builds. It then deploys with `wrangler` and curls the deployed hosts (the home page, the Help Center manifest's absolute paths, a search) until they answer. The Playwright suite doesn't run in CI; run it locally, or against the Beta site with `E2E_BASE_URL=https://beta.witnesswork.app WW_SITE_ENV=beta pnpm e2e`.

- **Nothing deploys from a branch.** Beta is the tip of `main`, so pull requests only check. To see a change before it merges, run it locally: `pnpm dev` in its package, or `pnpm build` then `pnpm preview` in `marketing`.
- **The Cloudflare token only reaches the deploy steps,** not installs, tests or builds. It can still edit every Worker in the account: Cloudflare can't limit a token to some Workers, so the `services-production` and `services-beta` branch policies (only `main`) stop mistakes, not a workflow edited on a branch. Anyone who can push a branch can change this workflow; keep it that way only for people and agents you trust with the Cloudflare account.
- **Smoke checks:** production must not say `noindex`, must return search results, and checks the old search host (`help-search.leviwilkerson.com`) too. Beta must say `noindex`, and only Beta accepts search's `503 search_unavailable` (a brand-new Worker has no index until its first sync).

The first Beta deploy creates `ww-marketing-beta`, `ww-help-search-beta` and their custom domains. Set the search Worker's `ADMIN_TOKEN` secret once per environment (not CI's job; see [`help-search`](./help-search/README.md)).

Break-glass, from each package's folder, with a Cloudflare token that can edit Workers (and Workers AI and KV for help-search):

```sh
# marketing
pnpm build && pnpm exec wrangler deploy                   # witnesswork.app
pnpm build:beta && pnpm exec wrangler deploy --env beta   # beta.witnesswork.app

# help-search
pnpm exec wrangler deploy                                 # help-search.witnesswork.app (+ the old host)
pnpm exec wrangler deploy --env beta                      # help-search-beta.witnesswork.app
```

Each site environment builds into its own folder (`dist/production`, `dist/beta`), and each `wrangler` environment uploads only its own, so a Beta build can't reach production.
