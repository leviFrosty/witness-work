---
name: beta-build
description: Ship the current branch to the WitnessWork Beta app on the user's phone — a Hot Updater bundle when native code is unchanged, otherwise a local build uploaded to internal TestFlight. Use when the user runs /beta-build or asks to push, send or ship work to Beta, TestFlight or their phone to test it.
---

# Beta build

WitnessWork Beta (`com.leviwilkerson.jwtimebeta`, orange icon) is an internal-TestFlight-only app with its own App Group, iCloud container and data, so any branch can ship to it without touching the App Store app or the user's real records. Invocation authorizes committing the thread's work and publishing it to Beta. Beta calls the production API, so it also authorizes releasing ww-api's `main` when it has unreleased commits. It never bumps the app's version, tags or pushes this repo, or touches the production app.

Optional argument: `ota` or `native` forces the path; default `auto`. `scripts/build-beta.sh --dry-run` reports the path without shipping.

**Production is out of scope.** If the arguments or a follow-up mention production, prod, the App Store, Google Play or a release, ship Beta only. Don't start a production release or read `/cut-release`'s files. "Prod" usually means ww-api, which this skill already releases. Dictation and autocorrect turn "api" into "app", so "release prod app" once shipped an unwanted production release. In the report, say that a production app release needs the user to run `/cut-release` and type its go-ahead keyword.

## 1. Commit the work

`scripts/build-beta.sh` ships committed code only (the in-app version row shows the commit hash, which is how the user confirms what they're running). If this thread has uncommitted work, commit it following `../comitting-and-branching/SKILL.md` (amend onto the branch's existing commit). Never commit to `main` here; if the tree is dirty on `main`, ask. Don't push unless asked.

## 2. Run the build

Run in the background and log to a file:

```bash
mkdir -p .asc && scripts/build-beta.sh --mode auto > .asc/beta-build.log 2>&1
```

The script takes a per-machine lock, syncs widget sources, loads `.env.beta` (falls back to the main checkout's copy), then compares HEAD's native fingerprint (`hot-updater.config.ts`) with the `Hot Updater runtime:` line of the latest TestFlight build's What to Test notes:

- **Match → OTA**: `node scripts/ota.mjs beta ios` (about 1–2 min) plus PostHog source maps.
- **Differs → native**: `eas build --profile beta --local` then `asc builds upload --wait` with What to Test = branch, commit, subject, Hot Updater runtime (about 15–30 min).

Before either path ships, `scripts/release-api.sh --branch <branch>` puts the backend out first (see `../release-process/SKILL.md`). It stops if ww-api's branch with this branch's name has commits that aren't on ww-api `main`. If ww-api `main` has commits since its latest `v*` tag, it tags and deploys the next ww-api version (about 1 min). Its `API_RESULT` line says `released` or `current`.

After the phone ships, the script deploys the same commit to the web beta, `beta.app.witnesswork.app` (`pnpm web:deploy:beta`, see `docs/web-hosting.md`). That needs a clean tree, and it uses wrangler's own login on this Mac. Its build refreshes the Help Center snapshot from `witnesswork.app` first (`pnpm sync:help`). Its `WEB_RESULT` line says `deployed`, `skipped` (`reason=help-center-unreachable`: that site didn't answer, so the web beta wasn't updated) or `failed`. A web failure leaves the phone's Beta shipped; the script still exits non-zero.

Tell the user which path it took. Watch the log to completion; relay only milestones (build started, upload, processing) and failures. The last line is `BETA_RESULT …`.

## 3. Report

Send a short summary the user can act on from their phone:

- **OTA:** commit and update channel. "Swipe WitnessWork Beta away and reopen it." Let the background download finish, then swipe it away and reopen it again. Settings → version row shows the new commit hash.
- **Native:** version (build), commit. "Update WitnessWork Beta in TestFlight." Processing is already complete when the script exits.
- **ww-api:** the tag, when `API_RESULT status=released`.
- **Web:** "Reload beta.app.witnesswork.app", when `WEB_RESULT status=deployed`.

## Failures

Read the log, diagnose, and report plainly. Fix code problems on the branch and rerun. Known environment issues:

- **Lock held:** another beta build is running on this machine; report its worktree (from the error) and wait or ask.
- **Signing/provisioning errors** (missing profile, capability or App Group/iCloud container not assigned): signing needs a one-time Apple login. The user must run `scripts/build-beta.sh --mode native --interactive` in a Terminal on this Mac. You can't do this remotely.
- **`errSecInternalComponent` / codesign can't access key:** the login keychain is locked (e.g. SSH session). The user must unlock it at the Mac, or run `security unlock-keychain ~/Library/Keychains/login.keychain-db` in their own terminal.
- **`--mode ota` refused:** native code changed since the latest TestFlight build; rerun with `native`.
- **Unmerged ww-api branch:** this feature's backend half isn't on ww-api `main`, so Beta would call a production API without it. Tell the user; don't merge or delete ww-api branches yourself. Rerun once it lands.
- **Web beta failed** (`WEB_RESULT status=failed`): the phone's Beta already shipped. Read the error above it; `wrangler login` fixes an expired login. Rerun just the web with `pnpm web:deploy:beta`.
- **ww-api tests, push or deploy failed:** nothing app-side shipped. Report the error or run URL. Rerunning is safe.
- **Missing `.env.beta`, `asc`/`eas` auth, Xcode or WWDR certificates:** see `docs/build.md` → Beta builds.

A native build that uploaded but failed Apple processing is not a success; report the processing state from the log.
