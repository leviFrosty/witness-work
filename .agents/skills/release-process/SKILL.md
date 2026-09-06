---
name: release-process
description: WitnessWork's branching and release workflow — trunk-based on `main`, version bump + release notes via `pnpm run bump-version`, and what each GitHub Actions workflow does. Use when opening a PR, asking which branch to target, cutting a release/version bump, writing release notes, or touching `.github/workflows/*.yml`.
---

# Branching and release process

The project is **trunk-based on `main`**. PRs target `main` directly, and `main` is not GitHub-protected (no required status checks) — checks still run, they just aren't enforced as a merge gate.

## Branch naming

Bare `[feature-name]`, no `feature/`, `agent/`, or similar prefix (see AGENTS.md guardrails). `fix/...` and `refactor/...` prefixes show up in practice for those categories, but plain descriptive names (`calendar-sync`, `notes-import`) are the norm.

## Day-to-day PR flow

```bash
git checkout main
git pull
git switch -C my-feature

# commit, push, open PR against main
git push -u origin my-feature
```

EAS preview builds don't run automatically (they're expensive) — kick one off manually from the Actions tab: **Actions → PR Preview Build → Run workflow**, picking the PR's branch. Optionally pass the PR number as input to get an EAS-dashboard-link comment posted on the PR. The workflow still runs lint/typecheck/`testFinal`/circular-dep check first.

## Cutting a release

Use `/cut-release` for the complete main → local build → App Review workflow. It is explicitly user-invoked; its source is `.agents/skills/cut-release/SKILL.md`.

`scripts/bump-version.js` is a deterministic preparation tool. The invoking agent writes notes and translations; the script does not call a model or Azure.

```bash
pnpm run bump-version minor --notes-file .asc/cut-release-notes.json --prepare
# Or maintenance without an in-app announcement:
pnpm run bump-version patch --skip-notes --prepare
```

The notes file contains `{ "notes": ["User-facing change"] }`; `[]` omits the announcement. `--prepare` changes package/app versions and optional `src/features/updates/constants/releaseNotes.ts` / English updates keys, without committing. It requires a clean tree. Validate inputs before mutation; failures retain files/history for recovery.

After translation, run `pnpm run check:locales`, `pnpm run check:all` and `pnpm run deps`. Stage explicit release files, commit `chore: bump version to X.Y.Z`, and create annotated `vX.Y.Z` with message `Release X.Y.Z`. Hooks stay enabled. The helper requires `--prepare` and never commits, tags or generates translations; the release skill owns those stages.

Push main and the specific release tag atomically:

```bash
git push --atomic origin main refs/tags/vX.Y.Z
pnpm run build:prod-auto-submit
```

The tag workflow validates and creates a GitHub Release; it does not build or upload. Production builds run locally via `eas build --local`, then upload with `asc builds upload`. Prerequisites are in `docs/build.md`. Upload is separate from Apple processing and App Review submission; see `../app-store-release/SKILL.md` for ASC operations.

## Workflows reference

| File                     | Trigger                                         | Does                                                                           |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `pr-preview-build.yml`   | manual (`workflow_dispatch`)                    | lint/typecheck/test/deps, then EAS iOS preview build                           |
| `tests.yml`              | push → `main`                                   | lint/typecheck/test/deps                                                       |
| `production-release.yml` | tag push `v*.*.*`                               | locale completeness/lint/typecheck/test/deps, GitHub Release (no build/upload) |
| `claude.yml`             | `@claude` mention on issue/PR comment or review | Claude Code responds inline                                                    |
