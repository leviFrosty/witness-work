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

```bash
pnpm run bump-version patch   # or minor, major
```

This script (`scripts/bump-version.js`) does the whole release-notes flow for you — don't hand-edit `releaseNotes.ts` first:

1. Bumps `version` in `package.json` and `app.config.ts`.
2. Unless `--skip-notes`, shells out to the `claude` CLI with the git log since the last tag (plus the last 3 versions of existing notes for context) to draft 3-8 user-facing bullets, then prompts you to accept or give feedback for a revision — loops until accepted.
3. Prepends the accepted notes into `src/constants/releaseNotes.ts` and `src/locales/en-US.json` (`updates.<versionKey>`), then runs `pnpm translate --force` to auto-translate into other locales.
4. Stages `package.json`, `app.config.ts`, plus the release-notes/locale files if notes were generated, commits as `chore: bump version to X.Y.Z`, and creates annotated tag `vX.Y.Z`.

Requires a clean working tree and the `claude` CLI on PATH (unless `--skip-notes`).

Push from `main`:

```bash
git push origin main --follow-tags
```

Pushing the tag is what matters — `production-release.yml` triggers on any `v*.*.*` tag push regardless of branch. That workflow re-runs lint/typecheck/test/circular-dep check, then `eas build --platform ios --profile production --auto-submit` (submits straight to App Store) and creates a GitHub Release with an auto-generated changelog since the previous release.

For App Store Connect-side steps (TestFlight, "What's New" per-locale, submission), see [[app-store-release]].

## Workflows reference

| File                     | Trigger                                         | Does                                                                         |
| ------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `pr-preview-build.yml`   | manual (`workflow_dispatch`)                    | lint/typecheck/test/deps, then EAS iOS preview build                         |
| `tests.yml`              | push → `main`                                   | lint/typecheck/test/deps                                                     |
| `production-release.yml` | tag push `v*.*.*`                               | lint/typecheck/test/deps, EAS production build + auto-submit, GitHub Release |
| `claude.yml`             | `@claude` mention on issue/PR comment or review | Claude Code responds inline                                                  |
