---
name: beta-build
description: Ship the current branch to the WitnessWork Beta app on the user's phone — an EAS Update when native code is unchanged, otherwise a local build uploaded to internal TestFlight. Use when the user runs /beta-build or asks to push, send or ship work to Beta, TestFlight or their phone to test it.
---

# Beta build

WitnessWork Beta (`com.leviwilkerson.jwtimebeta`, orange icon) is an internal-TestFlight-only app with its own App Group, iCloud container and data, so any branch can ship to it without touching the App Store app or the user's real records. Invocation authorizes committing the thread's work and publishing it to Beta. It never bumps versions, tags, pushes Git or touches the production app.

Optional argument: `ota` or `native` forces the path; default `auto`. `scripts/build-beta.sh --dry-run` reports the path without shipping.

## 1. Commit the work

`scripts/build-beta.sh` ships committed code only (the in-app version row shows the commit hash, which is how the user confirms what they're running). If this thread has uncommitted work, commit it following `../comitting-and-branching/SKILL.md` (amend onto the branch's existing commit). Never commit to `main` here; if the tree is dirty on `main`, ask. Don't push unless asked.

## 2. Run the build

Run in the background and log to a file:

```bash
mkdir -p .asc && scripts/build-beta.sh --mode auto > .asc/beta-build.log 2>&1
```

The script takes a per-machine lock, syncs widget sources, loads `.env.beta` (falls back to the main checkout's copy), then compares HEAD's native fingerprint (`fingerprint.config.js`) with the `Runtime:` line of the latest TestFlight build's What to Test notes:

- **Match → OTA**: `eas update --channel beta` (about 1–2 min) plus PostHog source maps.
- **Differs → native**: `eas build --profile beta --local` then `asc builds upload --wait` with What to Test = branch, commit, subject, runtime (about 15–30 min).

Tell the user which path it took. Watch the log to completion; relay only milestones (build started, upload, processing) and failures. The last line is `BETA_RESULT …`.

## 3. Report

Send a short summary the user can act on from their phone:

- **OTA:** commit and update group. "Swipe WitnessWork Beta away and reopen it." Launch waits up to 10 s for the update. Settings → version row shows the new commit hash.
- **Native:** version (build), commit. "Update WitnessWork Beta in TestFlight." Processing is already complete when the script exits.

## Failures

Read the log, diagnose, and report plainly. Fix code problems on the branch and rerun. Known environment issues:

- **Lock held:** another beta build is running on this machine; report its worktree (from the error) and wait or ask.
- **Signing/provisioning errors** (missing profile, capability or App Group/iCloud container not assigned): signing needs a one-time Apple login. The user must run `scripts/build-beta.sh --mode native --interactive` in a Terminal on this Mac. You can't do this remotely.
- **`errSecInternalComponent` / codesign can't access key:** the login keychain is locked (e.g. SSH session). The user must unlock it at the Mac, or run `security unlock-keychain ~/Library/Keychains/login.keychain-db` in their own terminal.
- **`--mode ota` refused:** native code changed since the latest TestFlight build; rerun with `native`.
- **Missing `.env.beta`, `asc`/`eas` auth, Xcode or WWDR certificates:** see `docs/build.md` → Beta builds.

A native build that uploaded but failed Apple processing is not a success; report the processing state from the log.
