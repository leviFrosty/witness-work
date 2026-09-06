---
name: cut-release
description: Cut a WitnessWork release from main through App Store review submission.
disable-model-invocation: true
---

# Cut release

Invocation authorizes committing, tagging, pushing, building locally, translating all app locales, and submitting to App Review with automatic release after approval. Optional `patch|minor|major` overrides the inferred bump. Use the invoking agent for prose and translations.

Read `CONTEXT.md`, `../release-process/SKILL.md`, `../app-store-release/SKILL.md`, and `docs/build.md`. The release-process skill owns Git conventions; app-store-release owns ASC commands and metadata. Use installed CLI help for current flags. Execute these steps; record evidence before advancing.

## 1. Resume or establish a clean main

Read [recovery.md](recovery.md) first. Persist the release journal at `.asc/cut-release.json` (ignored), updating it before and after external effects. Reconcile unfinished runs before starting another. Detect concurrent local runs and existing ASC submissions; resume the same release or report the conflicting identity rather than replacing another submission.

Record original branch and HEAD. Preserve an in-progress merge/rebase and report it. Otherwise inspect staged, unstaged and untracked changes; stash them with `git stash push --include-untracked -m "cut-release:<UTC timestamp>:<original branch>"`. Record the resulting stash object ID and notify the user immediately. Leave ignored environment files available for the local build. Verify a clean tree.

Fetch `origin` and tags. Switch to local `main` (create tracking main if absent), then rebase it onto fetched `origin/main`. Include unpushed local main commits; leave feature-branch commits on their branch. Conflicts stop the release with recoverable state. Record fetched remote SHA and reconciled source SHA.

Check Git push access and documented local build prerequisites, production environment presence, EAS authentication, and `asc doctor` without printing secrets. Verify the tag workflow has no cloud production build/upload.

**Complete:** clean reconciled main, saved user work, authenticated tools, journal identifying this run.

## 2. Determine the release and prepare files

Find the last publicly released ASC marketing version and its Git tag; verify the tag exists and is an ancestor of the source commit. Account for newer failed/pending release tags and existing ASC versions through recovery, not a fallback to arbitrary recent commits. Stop if a trustworthy baseline cannot be established.

Inspect commits AND the net diff from that baseline. New user-facing functionality means minor; fixes/maintenance mean patch; major requires an explicit argument. Calculate from the current package version after accounting for unfinished releases. Ensure the chosen version is newer than the public version and unused remotely. Verify package/app versions agree.

Write `{ "notes": [...] }` in `.asc/cut-release-notes.json`. Describe tangible outcomes users can observe, grouping related work; distinguish new capabilities from improvements. Exclude refactors, configuration, minor cosmetics, and unsupported performance claims. No minimum bullet count. With no notable changes use `[]`: no new releaseNotes.ts entry or updates locale keys, hence no announcement popup.

Run `pnpm run bump-version <bump> --notes-file .asc/cut-release-notes.json --prepare` on the clean tree. This writes versions and optional release-note entries; it neither translates nor commits. Record target version and exact changed files.

**Complete:** package.json and app.config.ts match the target; announcement files change only for notable notes.

## 3. Translate and validate

This invocation explicitly authorizes editing all `src/locales/*.json`, overriding the normal human-approved-only rule for this release. Use the invoking agent, not `pnpm translate` (Azure skips Bemba and does not refresh changed values).

Compare English leaf strings against the baseline tag. Translate every new/changed English string in every target locale, including Bemba, and fill all other missing, empty or whitespace-only translations. Preserve unrelated existing translations. Respect CONTEXT.md terminology and JW copy sensitivities. Preserve interpolation variables, formatting tokens, markup and plural semantics; inspect plural families and locale-specific forms. Record changed-source keys and coverage for every locale in the journal.

Run `pnpm run check:locales`; this checks every nonempty English leaf at its exact key path, including array indices. Inspect placeholder consistency and translation quality separately. Format the release files, then run `pnpm run check:all` and `pnpm run deps`. Fix release-generated errors; surface product-code failures for the user to address.

**Complete:** every locale covers every required English key, changed source keys refreshed, placeholders/plurals verified, checks pass.

## 4. Publish the release commit and tag

Fetch again before committing. If remote main advanced, preserve preparation in a separately named stash; rebase main, restore preparation without dropping that stash, and reconcile version collisions, notes and translations. Include new remote work; rerun affected preparation and all checks. Preserve conflicting preparation for inspection.

Review the final diff. Stage the explicit release file list only, including translated locales. Commit `chore: bump version to X.Y.Z` with hooks enabled. Verify hooks left a clean tree; inspect hook changes and rerun affected checks. Create annotated `vX.Y.Z` with message `Release X.Y.Z`.

Push main and ONLY this tag together with `git push --atomic origin main refs/tags/vX.Y.Z`. Prefer a normal push after rebasing. If reconciliation truly requires a forced main update, use an explicit `--force-with-lease=refs/heads/main:<freshly verified remote SHA>` only after proving all remote commits are retained. Never force a published tag. A rejected push requires refetch/reconciliation and revalidation; a local-only tag may be recreated after confirming it was never published. If already remote, resume its exact commit.

Verify remote main contains the release commit and the peeled remote tag matches it. Monitor tag workflow checks/GitHub Release before building; surface failures. Record immutable release SHA/tag.

**Complete:** verified release commit/tag remote, checks pass, local HEAD equals tagged commit, tree clean.

## 5. Build, upload and verify processing

Run `pnpm run build:prod-auto-submit` with persistent process output and a log path in the journal. Monitor to completion; keep the user informed. This builds locally and uploads; it does not submit the app version for review.

Record artifact path, checksum, source SHA, marketing version and build number extracted from the IPA, then ASC build ID. Require the IPA version to match the target; match ASC by both marketing version and build number, never just latest build. Verify widget sync/build preparation did not change tracked source; if it did, stop before review submission and reconcile artifact/source identity.

Follow recovery.md for retries and polling. Wait for this build's successful processing and eligibility for submission. Explicit compilation, signing, validation or Apple processing failure stops with diagnostics. Upload success alone does not complete this step.

**Complete:** exact release artifact has a verified, successfully processed ASC build ID.

## 6. Stage and submit

Follow app-store-release to create/reuse the intended version, copy prior text metadata, attach the verified build, check screenshots/required review information, and run ASC preflight. Set release type explicitly to `AFTER_APPROVAL`.

Maintenance releases use the reusable localized generic ASC notes. Feature/product changes get concise accurate feature summaries translated to every ASC locale using its locale mapping. ASC notes are separate from in-app announcements. Address changed screenshot/review-metadata requirements when shipped features require them.

Submit, then query actual version/submission. Verify target version, attached build ID, automatic release setting, and `WAITING_FOR_REVIEW` or a subsequent successful state (`IN_REVIEW`, `PENDING_APPLE_RELEASE`, `PROCESSING_FOR_DISTRIBUTION`, `READY_FOR_DISTRIBUTION`; legacy `READY_FOR_SALE`). Ready-to-submit, TestFlight review, rejection, and `PENDING_DEVELOPER_RELEASE` do not meet the target.

**Complete:** intended version/build in App Review or beyond, configured to release automatically. Report version, build, SHA/tag, ASC state/links, and remaining external wait. Mark journal complete. If user work was stashed, name it and ask whether to restore it on the original branch. Keep it until the user answers; restore with `apply --index`, retaining the stash on any conflict.
