---
name: cut-release
description: Cut a WitnessWork release from main through App Store and Google Play review submission, building iOS then Android before releasing either platform.
disable-model-invocation: true
---

# Cut release

Invocation authorizes committing, tagging, pushing, building both platforms locally, translating all app locales, and submitting to App Review and Google Play production review with automatic release after approval. Optional `patch|minor|major` overrides the inferred bump. The invoking agent and its subagents write the prose and translations.

Read `CONTEXT.md`, `../release-process/SKILL.md`, `../app-store-release/SKILL.md`, and `docs/build.md`. The release-process skill owns Git conventions; app-store-release owns ASC commands and metadata. Use installed CLI help for current flags. Execute these steps; record evidence before advancing.

Android is the second platform in the full release: build iOS first, then immediately build Android from the same release commit. Stage both stores and pass both preflights before submitting either for review. Any build, signing, upload, processing, metadata or preflight failure blocks submission on both platforms. An uploaded IPA or Play draft cannot substitute for this shared gate.

## 1. Resume or establish a clean main

Read [recovery.md](recovery.md) first. Persist the release journal at `.asc/cut-release.json` (ignored), updating it before and after external effects. Reconcile unfinished runs before starting another. Detect concurrent local runs, existing ASC submissions, and Play drafts/reviews/rollouts; resume the same release or report the conflicting identity rather than replacing another submission.

Record original branch and HEAD. Preserve an in-progress merge/rebase and report it. Otherwise inspect staged, unstaged and untracked changes; stash them with `git stash push --include-untracked -m "cut-release:<UTC timestamp>:<original branch>"`. Record the resulting stash object ID and notify the user immediately. Leave ignored environment files available for the local build. Verify a clean tree.

Fetch `origin` and tags. Switch to local `main` (create tracking main if absent), then rebase it onto fetched `origin/main`. Include unpushed local main commits; leave feature-branch commits on their branch. Conflicts stop the release with recoverable state. Record fetched remote SHA and reconciled source SHA.

Check Git push access (this repo and `~/dev/ww-api`), `gh` access to `leviFrosty/ww-api`, documented local build prerequisites, production environment presence, EAS authentication, and `asc doctor` without printing secrets. Verify the tag workflow has no cloud production build/upload.

Also verify the Android prerequisites and Play access in `docs/build.md`: JDK 17/SDK, production environment and signing credentials, Fastlane, and Google Play Developer API access for `com.leviwilkerson.jwtime` with production release permissions. Inspect Play Console app availability, outstanding setup/review requirements, and managed publishing. Resolve first-release or unpublished-app setup requirements before either store submission; reserve final publication/republication controls for step 7 after the shared gate. A draft upload cannot publish or republish the app. Missing Android access or prerequisites stop the entire release.

**Complete:** clean reconciled main, saved user work, authenticated tools, journal identifying this run.

## 2. Determine the release and prepare files

Find the last publicly released ASC marketing version and its Git tag; verify the tag exists and is an ancestor of the source commit. Account for newer failed/pending release tags and existing ASC versions through recovery, not a fallback to arbitrary recent commits. Stop if a trustworthy baseline cannot be established.

Inspect commits AND the net diff from that baseline. New user-facing functionality means minor; fixes/maintenance mean patch; major requires an explicit argument. Calculate from the current package version after accounting for unfinished releases. Ensure the chosen version is newer than the public version and unused remotely. Verify package/app versions agree.

Write `{ "notes": [...] }` in `.asc/cut-release-notes.json`. Describe tangible outcomes users can observe, grouping related work; distinguish new capabilities from improvements. Exclude refactors, configuration, minor cosmetics, and unsupported performance claims. No minimum bullet count. With no notable changes use `[]`: no new releaseNotes.ts entry or updates locale keys, hence no announcement popup.

Run `pnpm run bump-version <bump> --notes-file .asc/cut-release-notes.json --prepare` on the clean tree. This writes versions and optional release-note entries; it neither translates nor commits. Record target version and exact changed files.

**Complete:** package.json and app.config.ts match the target; announcement files change only for notable notes.

## 3. Translate and validate

Feature work changes only `en-US.json`, so the release cut translates every other locale. Follow `../translate-locales/SKILL.md`; it owns the translation rules and tooling.

Run its `todo --since <baseline tag>` for every locale, including Bemba. That covers new, changed, missing, empty and lint-failing keys. Fan out one subagent per locale (or per chunk) as that skill describes. Apply each locale's results, preserving unrelated existing translations. Record each locale's key counts by reason in the journal.

Run the skill's `lint` and `pnpm run check:locales`, which checks every nonempty English leaf at its exact key path, including array indices. Review translation quality separately. Run `pnpm sync:widget-shared` so the watch and Siri catalogs carry the new strings; they are release files too. Format the release files, then run `pnpm run check:all` and `pnpm run deps`. Fix release-generated errors; surface product-code failures for the user to address.

**Complete:** every locale covers every English key, changed and broken translations refreshed, lint and checks pass, native catalogs synced.

## 4. Release ww-api, then publish the release commit and tag

Ship the backend before any app artifact: run `scripts/release-api.sh` with persistent output and a log path in the journal. If ww-api `main` has commits since its latest `v*` tag, it tests them, tags and pushes the next ww-api version, then waits for its deploy and production `/health`; otherwise it confirms the latest tag deployed. Record its `API_RESULT` (status, tag, SHA). A failure stops the release before the app tag; fix the cause and rerun the script rather than tagging ww-api by hand.

Fetch again before committing. If remote main advanced, preserve preparation in a separately named stash; rebase main, restore preparation without dropping that stash, and reconcile version collisions, notes and translations. Include new remote work; rerun affected preparation and all checks. Preserve conflicting preparation for inspection.

Review the final diff. Stage the explicit release file list only, including translated locales and synced string catalogs. Commit `chore: bump version to X.Y.Z` with hooks enabled. Verify hooks left a clean tree; inspect hook changes and rerun affected checks. Create annotated `vX.Y.Z` with message `Release X.Y.Z`.

Push main and ONLY this tag together with `git push --atomic origin main refs/tags/vX.Y.Z`. Prefer a normal push after rebasing. If reconciliation truly requires a forced main update, use an explicit `--force-with-lease=refs/heads/main:<freshly verified remote SHA>` only after proving all remote commits are retained. Never force a published tag. A rejected push requires refetch/reconciliation and revalidation; a local-only tag may be recreated after confirming it was never published. If already remote, resume its exact commit.

Verify remote main contains the release commit and the peeled remote tag matches it. Monitor tag workflow checks/GitHub Release before building; surface failures. Record immutable release SHA/tag.

**Complete:** ww-api `main` released and deployed, verified release commit/tag remote, checks pass, local HEAD equals tagged commit, tree clean.

## 5. Build iOS, then Android, and verify both artifacts

### 5.1. iOS build and upload

Run `pnpm run build:prod-auto-submit` with persistent process output and a log path in the journal. Monitor to completion; keep the user informed. This builds locally and uploads; it does not submit the app version for review.

Record artifact path, checksum, source SHA, marketing version and build number extracted from the IPA, then ASC build ID. Require the IPA version to match the target; match ASC by both marketing version and build number, never just latest build. Verify widget sync/build preparation did not change tracked source; if it did, stop before review submission and reconcile artifact/source identity.

### 5.2. Android build immediately afterward

As soon as the iOS build/upload succeeds, run the local Android production AAB build from `docs/build.md` with persistent output and its own journal log. Do this before waiting for Apple processing or submitting to either store. Use the same clean tagged commit, production environment and marketing version; archive any existing AAB before the build overwrites it. Do not use EAS cloud builds or auto-submit for Android.

Record AAB path/SHA-256, source SHA, package, `versionName` and `versionCode` extracted from the bundle (for example with `bundletool dump manifest`). Require package `com.leviwilkerson.jwtime`, `versionName` equal to the IPA/target version, and a version code newer than all previously uploaded Play artifacts across tracks. EAS remotely increments each platform's build counter; the Android version code need not equal the iOS build number. Verify upload signing, every release ABI and 16 KB page compatibility, and that neither build changed tracked source. Any Android build or artifact failure stops here and leaves iOS unsubmitted.

### 5.3. Apple processing

Follow recovery.md for retries and polling. Wait for this build's successful processing and eligibility for submission. Explicit compilation, signing, validation or Apple processing failure stops with diagnostics. Upload success alone does not complete this step.

**Complete:** both verified local artifacts match the immutable release commit and marketing version, and the exact IPA has a successfully processed ASC build ID. Neither platform is submitted for review yet.

## 6. Stage both stores and pass the shared submission gate

### 6.1. App Store metadata and shared store notes

Follow app-store-release to create/reuse the intended version, copy prior text metadata, attach the verified build, check screenshots/required review information, and run ASC preflight. Set release type explicitly to `AFTER_APPROVAL`.

Maintenance releases use the reusable localized generic ASC notes. Feature/product changes get concise accurate feature summaries translated to every ASC locale using its locale mapping, following translate-locales' store-notes rules. ASC notes are separate from in-app announcements. Address changed screenshot/review-metadata requirements when shipped features require them.

Persist the finalized localized ASC `whatsNew` text in `.asc/cut-release/store-notes.json`; it is also the source for Google Play release notes. Reuse the exact text and translations on both stores, mapping ASC locale identifiers to supported Play locale identifiers. Keep each shared translation within Play's 500-Unicode-character limit; if shortening is needed, revise that shared text in ASC too, then read it back. Label platform-specific features accurately in the shared copy. Do not write an independent Android summary or silently truncate it. Translate additional Play-only locales from these same notes when needed, and record the locale mapping and notes checksum in the journal.

### 6.2. Google Play draft, metadata and preflight

Follow the Android Play playbook in `docs/build.md` to write version-code-specific changelog files from the shared store notes and upload the verified AAB to the `production` track as `draft`. Set `changes_not_sent_for_review=true` and disable Fastlane's automatic review-flag rescue so staging cannot silently submit. Preserve the existing completed production release, store listing, screenshots and unrelated releases; reconcile a conflicting draft before mutation.

Read back the exact version code, uploaded bundle checksum, draft status and localized notes. Verify successful bundle processing in Play Console, target API/device compatibility, signing and 16 KB checks, and required app content, Data safety/privacy, app access, screenshots, countries and production access. Update required release metadata when shipped behavior changes it. For an already-published app, validate the intended full production rollout of this existing draft without committing it (`supply --validate_only true` as documented); a draft-only validation is insufficient. For first publication, where Play may only accept draft releases through the API, inspect the exact draft's full-rollout preview/release summary in Console and resolve every readiness error without selecting Send for review, Start rollout or Publish. Record these Console readiness checks as the Play preflight instead; inability to verify them leaves the gate closed.

Verify Play uses standard publishing (managed publishing off), so approval automatically releases the update; managed publishing is unavailable for a first publication. If setup, an unpublished app, legal declarations or publishing controls require Play Console, complete readiness steps within this invocation's release authorization before proceeding, reserving final review/publication actions for step 7. If console access is unavailable, stop with the exact outstanding task and leave ASC unsubmitted. Do not change unrelated pending reviews or publishing changes.

### 6.3. Shared gate

Rerun ASC preflight after final metadata changes. Reconcile both stores again immediately before submission. Record the gate as passed only when both artifact identities, successful upload/processing, localized notes, both preflights and automatic-release settings are verified for this run. Any failure or unknown result leaves the gate closed; retain the uploaded IPA and Play draft for recovery and submit neither platform. On resume after one store already accepted this run's submission, follow recovery.md's read-only reconciliation for that platform instead of recreating a draft or rerunning its draft-only preflight; rerun preflight for the still-unsubmitted platform.

**Complete:** intended ASC version/build and exact Play production draft are ready, both store preflights pass, and the journal records the shared gate evidence.

## 7. Submit Google Play and App Store, then verify both

Require step 6's shared gate before either store submission, including its phase-aware revalidation on resume. Submit the exact Play draft first using the documented full production rollout with `changes_not_sent_for_review=false` and Fastlane rescue disabled; reuse its version code without uploading or rebuilding. For a first publication or required republication, perform the verified Console review/rollout/publication controls here after the gate, rather than rerunning an unsupported non-draft API transition. Verify that release is actually in review or published and standard publishing remains configured. A `completed` track configuration alone does not prove review submission or public availability. If Play leaves changes unsent, complete Send for review in Play Console before proceeding; draft, ready-to-send, rejection and approval awaiting manual publication do not meet the target. Skip submission for an already-accepted matching release on resume.

After verified Play submission, submit to App Review, then query actual version/submission. Verify target version, attached build ID, automatic release setting, and `WAITING_FOR_REVIEW` or a subsequent successful state (`IN_REVIEW`, `PENDING_APPLE_RELEASE`, `PROCESSING_FOR_DISTRIBUTION`, `READY_FOR_DISTRIBUTION`; legacy `READY_FOR_SALE`). Ready-to-submit, TestFlight review, rejection, and `PENDING_DEVELOPER_RELEASE` do not meet the target.

Query Play's release lifecycle for the exact production version code (`applications.tracks.releases.list`, or Play Console), requiring `RELEASE_LIFECYCLE_STATE_IN_REVIEW` or `RELEASE_LIFECYCLE_STATE_PUBLISHED` with the intended full rollout. Recheck both stores before completion. If either submission fails, stop and follow recovery.md for any already-submitted counterpart. Store submissions and subsequent reviews are independent, not an atomic transaction: the shared gate prevents known build/validation failures from releasing the other platform, but automatic approval cannot guarantee simultaneous availability or protect against a later store rejection. Report partial submission or withdrawal outcomes explicitly.

**Complete:** intended iOS version/build in App Review or beyond and Android production version code in Play review or published, both configured to release automatically. Report version, iOS build/ASC IDs, Android version code/track, SHA/tag, both store states/links, and remaining external waits. Mark journal complete only after both meet these conditions. If user work was stashed, name it and ask whether to restore it on the original branch. Keep it until the user answers; restore with `apply --index`, retaining the stash on any conflict.
