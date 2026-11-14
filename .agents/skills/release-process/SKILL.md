---
name: release-process
description: WitnessWork's release workflow — trunk-based on `main`, version bump + release notes via `pnpm run bump-version`, and what each GitHub Actions workflow does. Use when opening a PR, asking which branch to target, cutting a release/version bump, writing release notes, or touching `.github/workflows/*.yml`.
---

# Release process

The project is **trunk-based on `main`**. PRs target `main` directly, and `main` is not GitHub-protected (no required status checks) — checks still run, they just aren't enforced as a merge gate.

## Branch naming

Bare `[feature-name]`, no `feature/`, `agent/`, or similar prefix (see AGENTS.md guardrails). `fix/...` and `refactor/...` prefixes show up in practice for those categories, but plain descriptive names (`calendar-sync`, `scribe-ai`) are the norm.

## Day-to-day PR flow

```bash
git checkout main
git pull
git switch -C my-feature

# commit, push, open PR against main
git push -u origin my-feature
```

EAS preview builds don't run automatically (they're expensive) — kick one off manually from the Actions tab: **Actions → App preview build (manual, EAS cloud) → Run workflow**, picking the PR's branch. Optionally pass the PR number as input to get an EAS-dashboard-link comment posted on the PR. The workflow still runs lint/typecheck/`testFinal`/circular-dep check first.

## Cutting a release

Use `/cut-release` for the complete main → local iOS build → local Android build → App Store and Google Play review workflow. It is explicitly user-invoked; its source is `.agents/skills/cut-release/SKILL.md`. Production steps also need the user to type the go-ahead keyword `SHIP-PROD-X.Y.Z` for the exact version. `.husky/pre-push` refuses a `v*` tag push, `build:prod-auto-submit` refuses to build, `update:production` refuses to publish a production OTA (`docs/ota-updates.md`), and `web:deploy:production` refuses to deploy the web app (`docs/web-hosting.md`), unless `WW_RELEASE_CONFIRM` holds that keyword (`scripts/release-confirm.mjs`). Android builds immediately after the iOS build/upload from the same tagged commit and marketing version. Both stores must finish upload/processing and pass metadata/preflight checks before either review submission; a failure on either platform blocks both. The workflow reuses the exact localized ASC store notes for Play and configures automatic release after approval on both stores.

`scripts/bump-version.js` is a deterministic preparation tool. The invoking agent writes notes and translations; the script does not call a model or Azure.

```bash
pnpm run bump-version minor --notes-file .asc/cut-release-notes.json --prepare
# Or maintenance without an in-app announcement:
pnpm run bump-version patch --skip-notes --prepare
```

The notes file contains `{ "notes": ["User-facing change"] }`; `[]` omits the announcement. `--prepare` changes package/app versions and optional `src/features/updates/constants/releaseNotes.ts` / English updates keys, without committing. It requires a clean tree. Validate inputs before mutation; failures retain files/history for recovery.

Each `releaseNotes` entry has an optional `announce` level for first launch after updating. It defaults to `'passive'`: an item in the Home notifications tray, never blocking. Set `'silent'` for fix-only releases, which then appear only in Settings. Reserve `'sheet'` for rare, big releases that justify interrupting the user; the sheet lists only unseen releases. The first release at or past `UPDATE_REVEAL_VERSION` (`src/features/updates/constants/updateReveal.ts`) is a named Reveal update: give its entry `name: UPDATE_REVEAL_NAME` so What's New shows the same name as its launch reveal.

Feature PRs change only `en-US.json`; the release translates every other locale with `../translate-locales/SKILL.md`. After translation, run `pnpm run check:locales`, `pnpm sync:widget-shared`, `pnpm sync:help` (refreshes the offline Help Center snapshot in `src/assets/help-center/` from the live site), `pnpm run check:all` and `pnpm run deps`. Add the release's upgrade fixture (`RELEASE_FIXTURE=X.Y.Z pnpm vitest run src/__tests__/releaseFixturesGenerate.test.ts`, see `docs/upgrade-fixtures.md`). Stage explicit release files, the new `src/__tests__/__data__/releases/vX.Y.Z/` and any changed `src/assets/help-center/` snapshots included, commit `chore: bump version to X.Y.Z`, and create annotated `vX.Y.Z` with message `Release X.Y.Z`. Hooks stay enabled. The helper requires `--prepare` and never commits, tags or generates translations; the release skill owns those stages.

Push main and the specific release tag atomically:

```bash
export WW_RELEASE_CONFIRM=SHIP-PROD-X.Y.Z # typed by the user
git push --atomic origin main refs/tags/vX.Y.Z
pnpm run build:prod-auto-submit
```

The tag workflow validates and creates a GitHub Release; it does not build or upload. Production builds run locally via `eas build --local`, then upload with `asc builds upload`. Prerequisites are in `docs/build.md`. Upload is separate from Apple processing and App Review submission; see `../app-store-release/SKILL.md` for ASC operations.

`pnpm run build:prod-auto-submit` above remains the iOS build/upload command.
The release skill immediately follows it with the local Android production AAB
build from `docs/build.md`, stages a Play production draft with Fastlane `supply`,
and validates its full rollout alongside ASC preflight. It submits the exact Play
draft first, verifies review acceptance, then submits ASC; upload or draft success
alone does not complete a release. See `docs/build.md` for Play credentials,
shared-note locale/length handling, Console-only setup and automatic publishing,
and `../cut-release/recovery.md` for per-platform checkpoints and partial failures.

## Web app

The web app (`app.witnesswork.app`) deploys at the cut, together with the production API deploy and the production OTA update, because a web deploy is a release (ADR 0037 §4). From the tagged release commit on `main`, with the keyword the user typed:

```bash
export WW_RELEASE_CONFIRM=SHIP-PROD-X.Y.Z # typed by the user
pnpm web:deploy:production --dry-run      # plan only, reads no credential
pnpm web:deploy:production
```

It refuses without the keyword for this exact version, outside `origin/main`, or unless `vX.Y.Z` points at `HEAD`. Its Cloudflare token is read through the 1Password app, so a person approves it on this Mac. Never deploy it from CI. Beta deploys the web beta with every Beta ship (see [Beta](#beta)). Each web release must work alongside the previous native version, which may still be in review. Hosts, headers and gates: `docs/web-hosting.md`.

## Beta

Beta is the tip of `main`. Every push to `main` starts the **Beta ship** workflow (`beta-ship.yml`), which asks the private `leviFrosty/ww-runners` repository to run `scripts/build-beta.sh --mode auto` on one of our own Macs. The script waits for the Beta API first (below), then publishes a Hot Updater bundle when native code is unchanged, or builds and uploads a TestFlight build when it changed, then deploys the Beta maps and Turnstile frames and the web beta. Beta calls the Beta API (`api-beta.witnesswork.app`), with its own accounts and data, never production's.

- **Where to look:** the commit's **Beta ship** status. Green means that commit is on Beta. A burst of merges ends in one ship of the newest commit.
- **Don't ship Beta by hand,** and don't offer to. Merge the change; it ships.
- **A failed ship** opens one T3 Code thread on the Mac that ran it, with the commit, its pull request and the log. One thread per failure streak.
- **The Macs** are a pool GitHub hands jobs to: the Mac mini always, the MacBook only while it is on power and nobody is using it. They are attached to the private repository, never to this public one.

## Backend first (the API)

The API is in this repo (`services/api`) and has two deployed environments. The **API deploy** workflow (`api-deploy.yml`) deploys both:

- **Beta** (`api-beta.witnesswork.app`): every push to `main` that touches `services/api`. The Beta app and the web beta call it.
- **Production** (`api.witnesswork.app`): only on request, from `main`: `gh workflow run api-deploy.yml -f environment=production`.

A feature's backend half must be live before any app build that relies on it. `scripts/release-api.sh` makes sure of that, and both ship paths run it before building:

- The Beta ship (`scripts/build-beta.sh`) runs `scripts/release-api.sh --env beta`: it waits for the Beta deploy of the last commit that touched `services/api`, and starts one if none is running.
- `/cut-release` runs `scripts/release-api.sh` (production): it starts the production deploy when production is behind `main`'s API, and waits for it.
- An environment is current when the commit `/health` reports as `versionTag` contains the last commit on `main` that touched `services/api`. There are no API version tags or release commits any more.
- `--dry-run` reports what would deploy. Rerunning after any failure is safe.

Production's API also serves older app versions and goes live before store review, so keep its changes backward compatible. A server-only fix that production users need is deployed with the `gh workflow run` command above; it does not wait for an app release.

## Workflows reference

The name in the Actions tab says which product and environment a workflow touches. Only `services.yml` and `api-deploy.yml` deploy from GitHub's own machines; `beta-ship.yml` asks our Macs to ship Beta.

| File                     | Shown as                              | Trigger                                                                                                          | Does                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests.yml`              | Checks                                | every pull request, push → `main`, manual (`workflow_dispatch`)                                                  | three jobs: the app (iOS, Android, web: lint/typecheck/test/deps), the website (`services/`: website + Help Center search Worker: lint/typecheck/test/build), and the API (`services/api`: typecheck/test/end-to-end/fuzz; its steps run only when `services/api` or the workflow changed); no deploy |
| `api-deploy.yml`         | API deploy                            | push → `main` touching `services/api/**` or the workflow; manual with `environment`                              | deploys the API and the app-update Workers: a push or a manual `beta` run → Beta (`api-beta.witnesswork.app`, with the dev and beta update channels); manual `production` → production (`api.witnesswork.app`, with the prod update channel). GitHub environments `api-beta`, `api-production`        |
| `services.yml`           | Website deploy                        | push → `main` touching `services/**` (except `services/api`), the workflow, its smoke script or `.nvmrc`; manual | checks and builds `services/`, then: a push → both Beta (`beta.witnesswork.app`) and production (`witnesswork.app`); a manual run on `main` → Beta only; smoke checks after each deploy                                                                                                               |
| `beta-ship.yml`          | Beta ship                             | push → `main`                                                                                                    | asks the private `leviFrosty/ww-runners` repository to ship the tip of `main` to Beta from one of our Macs (see [Beta](#beta)); deploys nothing itself                                                                                                                                                |
| `production-release.yml` | App release tag                       | tag push `v*.*.*`                                                                                                | locale completeness/lint/typecheck/test/deps, GitHub Release (no build/upload)                                                                                                                                                                                                                        |
| `pr-preview-build.yml`   | App preview build (manual, EAS cloud) | manual (`workflow_dispatch`)                                                                                     | lint/typecheck/test/deps, then EAS iOS preview build                                                                                                                                                                                                                                                  |
| `claude.yml`             | Claude Code                           | `@claude` mention on issue/PR comment or review                                                                  | Claude Code responds inline                                                                                                                                                                                                                                                                           |
