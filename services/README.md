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

CI deploys on merge to `main` (production) and from branches (staging); the workflow lands right after this move. The commands it runs, from each package's folder, with a Cloudflare token that can edit Workers (and Workers AI and KV for help-search):

```sh
# marketing
pnpm build && pnpm exec wrangler deploy                   # witnesswork.app
pnpm build:dev && pnpm exec wrangler deploy --env dev     # dev.witnesswork.app

# help-search
pnpm exec wrangler deploy                                 # help-search.witnesswork.app (+ the old host)
pnpm exec wrangler deploy --env dev                       # help-search-dev.witnesswork.app
```

Each site environment builds into its own folder (`dist/production`, `dist/dev`), and each `wrangler` environment uploads only its own, so a staging build can't reach production.
