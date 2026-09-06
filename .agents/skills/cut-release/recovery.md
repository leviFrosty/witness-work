# Release journal and recovery

Persist `.asc/cut-release.json` before/after each side effect using an atomic temporary-file rename. Keep logs under `.asc/cut-release/`. Archive completed journals by version before beginning another release. Keep secrets out of journals/logs. Prevent simultaneous local releases with an exclusive lock directory `.asc/cut-release.lock`; record its owner/process and inspect stale locks before taking over. Release the lock when stopping, while retaining the journal.

Record as known:

- Run ID, phase, timestamps, last error, retry counts and log paths.
- Original branch/HEAD, user stash name/object ID, preparation stash IDs.
- Fetched remote SHA, source SHA, public baseline version/tag, bump/target version.
- Notes decision, changed English keys and refreshed keys per locale, release files/check results.
- Release commit/tag and verified remote identities.
- IPA path/SHA-256, marketing version, build number, ASC build/version/submission IDs.
- Processing start/deadline, release type, observed ASC state, completion/restoration status.

A journal is a checkpoint, not evidence of remote success. On resume inspect Git, artifacts, processes and ASC before repeating effects. Retain the selected version and immutable published tag. Incomplete generated files belong to the recorded release: do not treat them as unrelated user work and bump again.

## Failure rules

- Compilation/signing failures and explicit ASC upload/processing/validation failures: stop, retain evidence, and surface the actionable error. Never hide these by cutting another version.
- Timeouts and HTTP 5xx: at most three retries after the initial attempt, with 10/30/60-second backoff. Reconcile remote state before each retry. Reset count only after a successful phase, not on reinvocation.
- Keep tool waits short enough for progress updates at least once a minute. Poll processing every 30 seconds for up to 60 minutes per monitoring session. If still processing, record pending status and let another invocation resume monitoring; it is not a successful cut yet.
- Upload timeout: inspect existing IPA identity and search ASC for that exact version/build. Reuse a successfully uploaded build; if absent after reconciliation, retry `asc builds upload` with the SAME IPA. Do not rerun the combined build/upload script to retry upload.
- Interrupted local build: inspect process/logs and artifact before rebuilding. The combined script overwrites output and EAS increments build numbers, so archive an existing artifact plus identity before intentional rebuild. Never upload an unverified partial artifact.
- Commit/tag/push interruption: query history and remote refs. Continue from completed operations rather than bumping again. Preserve published tags.
- ASC stage/submit timeout: query version/build/submission first. Reuse existing objects; never replace another pending submission. Handle stage checkpoints using app-store-release instructions after confirming identities.
- Remote changes after publication do not alter this release: build the tagged commit in a clean checkout. Later commits belong to the next release.

## Stash restoration

After completion, or when reporting a stopped run, offer to restore the named user stash. Restore only after the user agrees and after checking the original branch/tree can accept it. Use the recorded object ID with `git stash apply --index`; retain the stash until successful restoration is verified. Never restore automatically into main or mix user work into the release.
