# Help Center support evidence

Reviewed September 29, 2026 (September 30 UTC). The FAQ additions combine
reported questions, aggregate production errors, and anticipatory Buddies
coverage verified against this checkout. Errors suggest useful support topics;
they do not establish a cause, a failure rate, or that a reported bug is fixed.

## PostHog

Read-only queries used `posthog-cli --dotenv-file .env api`, schema discovery
through `read-data-schema`, `query-trends`, and `query-error-tracking-issues-list`.
Queries requested `date_from: -30d`, filtered `app_variant = production`, and
excluded internal/test accounts with `filterTestAccounts: true`. Trends resolved
the window to August 31–September 30 UTC, with observations only through the run
time. These are exploratory event counts, not governed metrics or unique users.

| Signal                          | Observations                                                                                                                                | FAQ response                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `import_failed`                 | 49: 24 MyTime parse failures, 22 Notes model failures, 2 Notes device-verification failures, 1 Notes network failure                        | Correct supported import formats; explain original `.mytimedb` files, readable notes, preview review, retry, and updates.                               |
| SQLite “file is not a database” | 75 errors, 31 affected users in [Error Tracking](https://us.posthog.com/project/492895/error_tracking/01a0b722-58fb-7803-b822-489c79fe0b3a) | Explain MyTime's expected database format. Attribution to MyTime is inferred from code; this does not establish damage to WitnessWork's local database. |
| Notes model errors              | 22 errors, 5 affected users in [Error Tracking](https://us.posthog.com/project/492895/error_tracking/01a0b724-38de-73c2-a3cb-bb54e1c558d6)  | Suggest clear dates/names/time and smaller batches; distinguish an empty preview from a failure.                                                        |
| Purchase/store events           | 10 `supporter_purchase_failed`, 5 `paywall_offerings_failed`, 1 `supporter_restore_empty`                                                   | Explain Restore Purchases, Tip versus Supporter, and private account-ID support.                                                                        |
| Current location unavailable    | 7 errors, 4 affected users in [Error Tracking](https://us.posthog.com/project/492895/error_tracking/01a0d7a3-80f1-7081-b155-9b498ee5c993)   | Check foreground location permission; offer manual pins.                                                                                                |
| Help/backup actions             | 36 `help_center_opened`, 13 `notes_import_help_opened`, 242 `backup_exported`                                                               | Add searchable support answers and remind users to complete saving and check the file exists. Export events do not prove files were saved.              |

No log services were returned for the window, and the live schema contained no
Buddies custom events. Buddies questions below are implementation-based coverage,
not a claim about observed production complaints.

## GitHub questions and verified behavior

Reviewed the 100 most recent issues across all states and selected owner replies.

| Question                                 | Reports                                                                                                                                                                                     | Current behavior checked                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backup unreadable or recovery incomplete | [#433](https://github.com/leviFrosty/witness-work/issues/433), [#277](https://github.com/leviFrosty/witness-work/issues/277)                                                                | [Settings entry](../../src/features/settings/components/sections/App.tsx) and [backup import/export](../../src/features/settings/screens/ImportAndExportScreen.tsx): Settings → Backup & Restore handles files; Preferences → Backups only handles reminders. Restore replaces included stores.                                          |
| Hourglass option/Credit Time             | [#392](https://github.com/leviFrosty/witness-work/issues/392), [#399](https://github.com/leviFrosty/witness-work/issues/399), [#429](https://github.com/leviFrosty/witness-work/issues/429) | [Report data](../../src/features/service-reports/hooks/useMonthReportData.ts) and [submission links](../../src/features/service-reports/lib/submitLinks.ts): manual handoff; Hourglass preaching minutes exclude Credit Time, which appears in default remarks.                                                                          |
| Disable foreground sounds                | [#365](https://github.com/leviFrosty/witness-work/issues/365), [#486](https://github.com/leviFrosty/witness-work/issues/486)                                                                | [Audio preferences](../../src/features/settings/components/preferences-sections/AudioAndHapticsPreferencesSection.tsx): Play sounds controls foreground sounds; background reminders use device notification settings.                                                                                                                   |
| Keep visit notes without a follow-up     | [#480](https://github.com/leviFrosty/witness-work/issues/480)                                                                                                                               | [Visit form](../../src/features/visits/screens/VisitFormScreen.tsx): Follow Up can be disabled independently of saving the visit.                                                                                                                                                                                                        |
| Import MyTime or written notes           | [#360](https://github.com/leviFrosty/witness-work/issues/360), [#378](https://github.com/leviFrosty/witness-work/issues/378)                                                                | [MyTime import](../../src/features/mytime-import/hooks/useMytimeImport.ts), [Notes availability](../../src/features/notes-import/hooks/useNotesImportAvailability.ts), and [Notes Help](../../src/features/notes-import/components/NotesImportHelpSheet.tsx). Avoid fixed allowance numbers; the current schedule comes from the server. |
| Share a personal schedule                | [#288](https://github.com/leviFrosty/witness-work/issues/288)                                                                                                                               | Buddies shares upcoming personal plans; it does not imply a shared congregation contact database.                                                                                                                                                                                                                                        |

## Buddies coverage and privacy

- [Availability](../../src/features/buddies/hooks/useBuddiesEnabled.ts) depends on
  rollout and the [iOS native module](../../modules/buddies-keychain/index.ts).
  No Supporter gate applies to Buddies itself.
- [Limits](../../src/features/buddies/lib/state.ts), the
  [pairing engine](../../src/features/buddies/lib/engine.ts), and
  [protocol](../buddies-protocol.md) establish five spots including pending
  relationships/invites, single-use seven-day invites, and inviter confirmation
  before calendar sharing. The relay permits three unused open links at once.
- [Calendar payload](../../src/features/buddies/lib/card.ts) contains dates,
  start times and durations for 56 days, plus the filtered shared profile.
  [Sharing settings](../../src/features/buddies/components/BuddiesSharingSection.tsx)
  make photos and pioneer status optional.
- [Explicit invitation payloads](../../src/features/buddies/lib/shares.ts)
  additionally share a Plan's title/location/note or a Follow-up's first name,
  address/pin/topic and date/time. Follow-up details expire 24 hours after the
  visit. Existing English pairing privacy copy was corrected to distinguish
  these invitations from automatic calendar sharing.
- [Accepted Plan linking](../../src/features/buddies/lib/linkedPlans.ts) follows
  invitation changes and cancellation. A Follow-up invite does not import a
  Contact or its visit history.
- Hiding is local visibility; removal ends the relationship. Offline removal
  can remain pending. Deletion cannot be undone. The
  [engine](../../src/features/buddies/lib/engine.ts) and
  [iCloud Keychain storage](../../modules/buddies-keychain/ios/BuddiesKeychainModule.swift)
  establish conditional recovery through the same Apple Account's encryption
  key, separately from Supporter iCloud Sync and JSON backups.

## Sentry access and support resources

The Sentry CLI issue read for the configured project returned **403 Forbidden**
using the existing token. No Sentry issues/logs, counts, or issue links were
available. Sync/photos/purchase guidance was verified from the current
[iCloud preferences](../../src/features/settings/screens/preferences/screens/PreferencesiCloudScreen.tsx)
and [purchase restore handler](../../src/features/supporter/screens/PaywallScreen.tsx).
Sync now is not proof of successful delivery; turning image sync off removes
remote photos, so neither is presented as a guaranteed reset/fix.

Help Center resources reuse [canonical links](../../src/constants/links.ts) and
the [private support email](../../src/constants/contactInformation.ts): bug and
feature forms, source/known issues, Privacy Policy, and OpenRouter's ZDR policy.
Public reports should exclude contact details, notes, backup files, account IDs,
and Buddies Codes/invite links. Only `en-US.json` was edited; new keys use the
existing English fallback until human-approved translations are available.
