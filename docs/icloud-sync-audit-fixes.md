# Medium, Low, and other iCloud audit fixes

This PR addresses the requested Medium/Low/other scope as one change. Critical
and High findings remain a separate workstream, except dependencies required to
make photo transfer and restore behavior safe. A native iOS rebuild is required.
Only English copy is changed; other locales require human approval.

## Medium

| Audit item               | Implemented behavior                                                                                                                                                                                                  | Regression evidence                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 17 Supporter lapse       | Preserve enable/explicit choice, pause transfer, resume on access; visible auto-enable conflict prompt; ignore own file for first-enable decision                                                                     | Supporter components; initial-enable/runtime tests                |
| 18 Reminders             | Reconcile local OS requests after launch/merge/restore/reschedule/deletion on both platforms                                                                                                                          | `useReconciledReminders.test.tsx`, `auditRecovery.test.ts`        |
| 19 Push retries          | Persist dirty state, retry failed writes with bounded backoff, catch up on readiness/foreground                                                                                                                       | `iCloudSyncCatchUp.test.ts`                                       |
| 20 Restart onboarding    | `onboardingComplete` excluded on send and receive                                                                                                                                                                     | `auditMerge.test.ts`, backup tests                                |
| 21 Device clocks         | Calibrate sync metadata with HTTPS Date, cache offset, advance edits past previous stamps, translate legacy writer clocks, bound future stamps                                                                        | `syncClock.test.ts`, `auditRecovery.test.ts`                      |
| 22 Equal timestamps      | Stable canonical content tie-break for records and settings                                                                                                                                                           | `auditMerge.test.ts`                                              |
| 23 Preference maps/lists | Per-entry value/deletion/membership timestamps; independent month/role edits survive                                                                                                                                  | `auditMerge.test.ts`, Role History and store tests                |
| 24 Malformed JSON        | Validate nested collections/records/preferences, unsafe keys, dates and timestamps; isolate bad files and show incomplete status                                                                                      | Validation, full payload round-trip, runtime malformed-peer tests |
| 25 Set up fresh          | Persist explicit local off choice and stop already-running pulls before applying data                                                                                                                                 | Runtime in-flight disable test                                    |
| 26 Address prefill       | Device-only on send, receive, and backup restore                                                                                                                                                                      | Merge and backup tests                                            |
| 27 Legacy duplicates     | Stable migration ids and deterministic definition reconciliation with alias references; preserve conflicting field values                                                                                             | `auditRecovery.test.ts`, migration tests                          |
| 28 Stale saves           | Contact forms patch changed fields/maps against current state; late geocoding checks current address/pin; map writes only coordinates                                                                                 | `auditRecovery.test.ts`, Contact Form tests                       |
| 29 Photo timing          | Revision filenames, separate download destinations, current-reference/stamp guards, atomic writes                                                                                                                     | Image tests; native build                                         |
| 30 Photo retention       | Cleanup with deletion/supersession evidence + one-day grace; preserve recoverable archives; erase all owner revisions on redaction/permanent erasure; explicit cloud cleanup on pause; reset clears obsolete binaries | Image/cleanup tests and recovery controls                         |

## Low

| Finding                               | Implemented behavior                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Tombstones detected by count          | Compare final canonical contents; aliases combine across deletion copies                                |
| Newer version skipped silently        | Persist and display newer-version status; manual action fails visibly                                   |
| Delete legacy file after read         | Keep source files to protect concurrent old writers                                                     |
| Restore own stale snapshot            | Exclude current installation’s file from one-shot restore/first enable                                  |
| Restore sends Buddies declines        | Mark replacement as remote mutation; suppress deletion declines                                         |
| Recurring start-date ID swap          | Only reject the same id; allow separate series on the same start day                                    |
| Incoming device settings              | Shared exclusion policy applies on parse, merge, restore, and backup                                    |
| Non-deterministic backfill/LDC stamps | Deterministic legacy timestamp `1`                                                                      |
| Custom field ordering                 | Stamp every changed active/archived position                                                            |
| Indefinite soft-deleted details       | Redact on both platforms after 90 days; retain id/timestamp; undated legacy grace period                |
| Concurrent image bookkeeping          | One queue for upload/download/cleanup                                                                   |
| Binary timeout/serial downloads       | Cancel native reads after ten seconds; four concurrent downloads                                        |
| Query start/waiter leak               | Main-queue start/stop and removal of timed-out scan waiters                                             |
| Missing profile photo prompt          | Check profile slice as well as contact and legacy profile references                                    |
| Missing control analytics             | Choice, dismissal, manual/reset/photo outcomes, auto-enable/conflict prompt events                      |
| Copy/FAQ/docs                         | Accurate pause/rebuild limits, supporter recovery, profile/photo privacy, device wording, current paths |

## Other

| Finding                                 | Implemented behavior                                                | Evidence                              |
| --------------------------------------- | ------------------------------------------------------------------- | ------------------------------------- |
| Time-entry date moved to another month  | Lookup by id and move into the destination month/year bucket        | Store normalization regression        |
| Backup missing category/profile         | Include and round-trip both; preserve installation settings/consent | `backupRecovery.test.ts`              |
| Replace shared contact drops new visits | Add missing visit ids before updating existing ones                 | Store-backed shared-import regression |

## Boundaries and remaining work

Photo safety required some overlap with Critical 3/4 and High 9/10: send photo
references regardless of transfer consent, publish data before photos, re-upload
missing cloud files, reconnect existing local files, and preserve uploaded files
when pausing one device. JSON restore isolation also overlaps High 11; final-state
change detection overlaps High 7. Non-identifying deletion tombstones are also retained without an age expiry to
protect clock-skewed deletions (overlapping Critical 2). These dependencies do not imply that the entire
Critical/High audit is fixed.

Plan tombstones, retired-device management, distributed reset markers, occurrence edit
stamps, permanent-delete/import-undo tombstones, Apple Account change detection,
cloud-upload acknowledgement, onboarding replacement confirmation, rollover pair
identity, and category credit propagation remain outside this PR’s requested
scope. In particular, Rebuild/Keep cannot stop another device sending data back,
and a local write cannot certify that Apple uploaded it. The UI/FAQ state these
limits. Clearing cloud photos is explicit; other enabled devices can re-upload
copies, so pause photo transfer on those devices first.

Clock calibration is best effort. Offline devices keep their cached offset and
monotonic edit ordering; legacy filesystem dates do not provide perfect global
chronology. No real multi-device Apple Account test can be performed with mocked
bridge tests or unsigned simulators. Release validation should include signed
physical iPhone/iPad devices with iCloud enabled, offline edits, storage failure,
and account switching alongside the separate Critical/High fixes.
