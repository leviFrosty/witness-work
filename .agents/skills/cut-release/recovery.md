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
- Android build log, AAB path/SHA-256, package, source SHA, `versionName`/`versionCode`, upload certificate and artifact verification results.
- Shared localized store-notes path/checksum, ASC-to-Play locale mapping and per-store note verification.
- Play edit IDs when available, uploaded bundle checksum, production draft/release identity, processing/preflight results, publishing mode, lifecycle state and Console link.
- Shared gate evidence/timestamp and separate submission attempts, observed states and withdrawal results for both stores.

A journal is a checkpoint, not evidence of remote success. On resume inspect Git, artifacts, processes, ASC and Google Play before repeating effects. Retain the selected version and immutable published tag. Incomplete generated files belong to the recorded release: do not treat them as unrelated user work and bump again. Older iOS-only journals do not satisfy the shared gate: reconcile any existing ASC submission and establish Android state before further release actions.

## Failure rules

- Compilation/signing failures and explicit ASC upload/processing/validation failures: stop, retain evidence, and surface the actionable error. Never hide these by cutting another version.
- Timeouts and HTTP 5xx: at most three retries after the initial attempt, with 10/30/60-second backoff. Reconcile remote state before each retry. Reset count only after a successful phase, not on reinvocation.
- Keep tool waits short enough for progress updates at least once a minute. Poll processing every 30 seconds for up to 60 minutes per monitoring session. If still processing, record pending status and let another invocation resume monitoring; it is not a successful cut yet.
- Upload timeout: inspect existing IPA identity and search ASC for that exact version/build. Reuse a successfully uploaded build; if absent after reconciliation, retry `asc builds upload` with the SAME IPA. Do not rerun the combined build/upload script to retry upload.
- Interrupted local build: inspect process/logs and artifact before rebuilding. The combined script overwrites output and EAS increments build numbers, so archive an existing artifact plus identity before intentional rebuild. Never upload an unverified partial artifact.
- Commit/tag/push interruption: query history and remote refs. Continue from completed operations rather than bumping again. Preserve published tags.
- ASC stage/submit timeout: query version/build/submission first. Reuse existing objects; never replace another pending submission. Handle stage checkpoints using app-store-release instructions after confirming identities.
- Remote changes after publication do not alter this release: build the tagged commit in a clean checkout. Later commits belong to the next release.
- An explicit Android build/signing, AAB identity, Play upload/processing/validation, metadata or publishing-readiness failure also stops the entire release. Until both store preflights pass, retain the IPA and Play draft and submit neither platform. A saved gate flag alone is insufficient on resume; recheck its artifact/store evidence.
- If Android fails after the iOS build/upload, retain the verified IPA and ASC build ID; resume the failed Android phase without rebuilding or submitting iOS. If Apple processing fails after Android builds, retain both artifacts and leave Play unsubmitted.
- Apply the interrupted-build rule to Android too: inspect process/logs, archive any existing AAB and identity before rebuilding, and never upload a partial bundle. Both builds must keep the same published source SHA; a product-code fix belongs to a new release/tag rather than rewriting this one.
- Play upload timeout: reconcile the exact version code and remote bundle SHA-256, production draft and release lifecycle before retrying. Reuse a matching uploaded bundle; retry only the SAME AAB if absent. A used version code or checksum mismatch requires reconciliation, not a blind rebuild or overwrite. Reuse an existing draft for this run and never replace another release's draft/review.
- Play edit validation/commit or review-submission timeout: inspect the recorded edit, production release and lifecycle before repeating. An expired edit, Console mutation or another committed edit invalidates that edit; reread remote state before creating another. Creating an edit can invalidate another active edit, so serialize Play mutations. Keep draft staging flags explicit and disable automatic review-flag rescue on retries.
- If Play requires Console-only Send for review, first publication/republication or setup, preserve the ready draft and leave ASC unsubmitted until completed. First-publication readiness uses the exact draft's Console release preview and resolved setup errors when the API rejects non-draft transitions; final submission/publication still waits for the shared gate. Record the exact Console blocker; an upload/commit success or `completed` track status is not evidence of an accepted review.
- Once either platform has been submitted, a failure on the other leaves a partial release, never a completed journal. Reconcile both stores first. Withdraw this run's already-submitted counterpart before approval/publication when supported (ASC review cancellation or removing this release's Play review changes in Console), verify the withdrawal, and record any failure or unavailable control. Do not withdraw unrelated work or claim an already-public build was rolled back; if approval/publication raced the failure, report the actual availability and required recovery. Later store rejection also requires reconciling both states; the shared build gate does not make independent store reviews atomic.

## Resume after an accepted store submission

Verify that this run passed the shared gate before its first submission. For an
already-submitted matching release, recheck artifact/source identity, uploaded
checksum, localized notes, review lifecycle and automatic-release/rollout settings
through read-only queries. Preserve its accepted submission; skip upload, draft
recreation and draft-only validation. In particular, Fastlane's `--rollout`
validation selects draft/in-progress releases and cannot be repeated once this
run's Play track release is `completed` and in review or published.

Rerun preflight only for the still-unsubmitted platform, then finish that missing
submission. If both are already accepted, reconcile and finish the journal
without submitting again. Changed identities, rejection, missing gate evidence
or a new readiness failure stop further submissions and require the partial
failure rules above; never reopen the gate from a saved flag alone.

## Stash restoration

After completion, or when reporting a stopped run, offer to restore the named user stash. Restore only after the user agrees and after checking the original branch/tree can accept it. Use the recorded object ID with `git stash apply --index`; retain the stash until successful restoration is verified. Never restore automatically into main or mix user work into the release.
