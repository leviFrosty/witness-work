# services

Non-app services, in their own pnpm workspace ([ADR 0042](../docs/adr/0042-witnesswork-app-domain.md) §4). Nothing here is part of the app: the root `tsconfig.json`, ESLint, Vitest, Prettier's content rules and Metro all leave `services/` alone, and the app's `node_modules` never serves it (this workspace has its own lockfile, `pnpm-lock.yaml`, and its own React).

| Package                        | What                                                                                                                                               | Deploys as                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`marketing`](./marketing)     | The website at `witnesswork.app`: landing page (19 languages), privacy, terms, support, `/get`, and the Help Center with its bundles the app reads | Worker `ww-marketing` (static assets only); `ww-marketing-dev` at `dev.witnesswork.app`             |
| [`help-search`](./help-search) | The Help Center search API                                                                                                                         | Worker `ww-help-search` at `help-search.witnesswork.app`; `ww-help-search-dev` for the staging site |

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

[`.github/workflows/services.yml`](../.github/workflows/services.yml) deploys both Workers:

| Trigger                                               | Deploys                                                                       | Environment           |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------- |
| Push to `main` touching `services/**` or the workflow | Production: `witnesswork.app`, `help-search.witnesswork.app`                  | `services-production` |
| Push to any other branch touching the same paths      | Staging: `dev.witnesswork.app` (`noindex`), `help-search-dev.witnesswork.app` | `services-staging`    |
| `workflow_dispatch` on any ref (even `main`)          | Staging only                                                                  | `services-staging`    |

Production only ever comes from a push to `main`. Each run installs with the frozen lockfile, runs lint, typecheck and unit tests, builds, deploys with `wrangler`, then curls the deployed hosts (the home page, the Help Center manifest's absolute paths, a search) until they answer. The Playwright suite doesn't run in CI; run it locally, or against staging with `E2E_BASE_URL=https://dev.witnesswork.app WW_SITE_ENV=dev pnpm e2e`.

- **Staging is last push wins.** One staging site serves every branch, so a push to an older branch rolls `dev.witnesswork.app` back to it.
- **The Cloudflare token only reaches the deploy steps,** not installs, tests or builds. It can still edit every Worker in the account: Cloudflare can't limit a token to some Workers, so the `services-production` branch policy (only `main`) stops mistakes, not a workflow edited on a branch. Anyone who can push a branch can change this workflow; keep it that way only for people and agents you trust with the Cloudflare account.
- **Smoke checks:** production must not say `noindex`, must return search results, and checks the old search host (`help-search.leviwilkerson.com`) too. Only staging accepts search's `503 search_unavailable` (a brand-new Worker has no index until its first sync).

The first staging deploy creates `ww-marketing-dev`, `ww-help-search-dev` and their custom domains. Set the search Worker's `ADMIN_TOKEN` secret once per environment (not CI's job; see [`help-search`](./help-search/README.md)).

Break-glass, from each package's folder, with a Cloudflare token that can edit Workers (and Workers AI and KV for help-search):

```sh
# marketing
pnpm build && pnpm exec wrangler deploy                   # witnesswork.app
pnpm build:dev && pnpm exec wrangler deploy --env dev     # dev.witnesswork.app

# help-search
pnpm exec wrangler deploy                                 # help-search.witnesswork.app (+ the old host)
pnpm exec wrangler deploy --env dev                       # help-search-dev.witnesswork.app
```

Each site environment builds into its own folder (`dist/production`, `dist/dev`), and each `wrangler` environment uploads only its own, so a staging build can't reach production.
