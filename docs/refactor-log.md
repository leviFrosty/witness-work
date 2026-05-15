# Refactor Log

Refactors flagged during glossary/domain clarifications. Each item is something the codebase doesn't yet match the canonical language for — record only, do not action during grilling.

## Open

### From CONTEXT.md alignment

- **Preferences field rename: `publisher` → `role`**
  Source: [`src/stores/preferences.ts:228`](src/stores/preferences.ts:228) (`publisher: 'publisher' as Publisher`).
  Why: Glossary defines **Publisher** = the role. A field of type `Publisher` named `publisher` reads awkwardly. `role` matches the glossary directly.
  Touches: preferences store, MMKV persisted shape (migration needed), every consumer of `usePreferences().publisher`, the `setPublisher` action, iCloud sync field mapping.

- **Hook split: introduce `useUser()` for user-profile reads**
  Why: `usePublisher()` currently mixes role/capability data with user-profile data (name, displayName). Glossary now separates **User** (the human) from **Publisher** (their role). A `useUser()` hook for profile-only reads keeps the two concerns clean; `usePublisher()` stays as the role+capabilities accessor.
  Touches: `src/hooks/usePublisher.ts`, callers that only need name/avatar.

- **Rename `tag` field → `category`; consider promoting Category to a first-class record**
  Source: [`src/types/serviceReport.ts:8`](src/types/serviceReport.ts:8) (`tag?: string`).
  Why: Glossary defines **Category** as the grouping concept (with its own is-credit attribute); "tag" is the legacy name and implies display-only chrome, which the comment on that field still says. Today the same category string can be saved with `credit: true` on one entry and `credit: false` on another — silent data inconsistency. A first-class Category record (`{ id, name, isCredit }`) would lock that down and pairs naturally with the [LDC collapse refactor](#collapse-ldc-boolean-into-credit-time) — LDC becomes a built-in Category.
  Touches: `ServiceReport.tag` → `category` (or `categoryId`), all writers (the time-entry form), all readers (Service Report breakdown UI, widget), MMKV-persisted shape, iCloud sync mapping.

- **Collapse `ldc` boolean into Credit Time**
  Source: [`src/types/serviceReport.ts:6`](src/types/serviceReport.ts:6) (`ldc?: boolean`, `credit?: boolean`).
  Why: Glossary defines **LDC Time** as a common variety of **Credit Time**, not a separate concept. The current dual-boolean shape is legacy from before tags existed; the cap math already collapses them ([`src/lib/serviceReport.ts:85`](src/lib/serviceReport.ts:85), [`:400`](src/lib/serviceReport.ts:400)). Future shape: a single `credit: boolean` + a `tag` (or category enum) that recognizes `'LDC'` as a known value. Bethel could be another pre-flagged category.
  Touches: `ServiceReport` type, all `ldc` readers/writers, the LDC breakdown UI, MMKV-persisted shape (migration: `ldc: true` → `credit: true, tag: 'LDC'` where no tag exists), iCloud sync mapping.

- **Rename "Service Year Catch Up" → "Onboarding Backfill"**
  Source: [`src/features/service-reports/screens/ServiceYearCatchUpScreen.tsx`](src/features/service-reports/screens/ServiceYearCatchUpScreen.tsx), [`src/features/service-reports/components/ServiceYearCatchUpBanner.tsx`](src/features/service-reports/components/ServiceYearCatchUpBanner.tsx), [`src/features/service-reports/components/ServiceYearCatchUpForm.tsx`](src/features/service-reports/components/ServiceYearCatchUpForm.tsx), [`src/features/onboarding/components/steps/ServiceYearCatchUp.tsx`](src/features/onboarding/components/steps/ServiceYearCatchUp.tsx), `ServiceYearCatchUp` route in [`src/types/rootStack.ts`](src/types/rootStack.ts).
  Why: Glossary defines this as **Onboarding Backfill** to signal the one-time, ephemeral nature of the flow and to disambiguate it from Time Rollover. "Catch Up" alone collides with overdue-follow-up language used in the conversations context.
  Touches: file/component/screen renames, route name in `RootStackParamList`, navigation calls, i18n keys.

- **Store split: extract Profile from Preferences**
  Source: [`src/stores/preferences.ts`](src/stores/preferences.ts) — `name`, `avatar`, `avatarBackground`-equivalents currently live alongside `publisher`, `publisherHours`, plan settings, etc.
  Why: Glossary defines **Profile** (User identity) and **Preferences** (User settings) as conceptually distinct. Today they share one MMKV store, which makes scoping changes, persisting differently (e.g. profile syncs with iCloud but some preferences don't), and reasoning about ownership awkward.
  Touches: a new `profile` store with its own MMKV key, migration that splits the existing `preferences` blob on first read, every consumer of profile-shaped reads (`name`, `avatar`, etc.), iCloud sync field mapping.

- **Day-vs-weekday naming: `excludedWeekdays` → `offDays`, `meetingWeekdays` → `meetingDays`**
  Source: [`src/lib/assistantState.ts:7`](src/lib/assistantState.ts:7) (`excludedWeekdays`, `meetingWeekdays` in the recommendation-input fingerprint), `EngineParams.meetingDay*` cap names, the underlying preferences fields, and any UI strings using "excluded weekday".
  Why: Glossary defines **Off Day** and **Meeting Day** without binding the concept to weekday-only storage. The shape today is weekday numbers; renames here align names with the concept and leave room to broaden storage to arbitrary calendar dates later without another rename.
  Touches: assistant input fingerprint shape (will produce a new hash — fine, just re-arms once), preferences shape, settings UI rows, i18n keys.

- **Goal naming: collapse `yearGoal*` → `annualGoal*`**
  Source: [`src/lib/milestones.ts:29`](src/lib/milestones.ts:29) (`yearGoalHours` parameter on `getEffectiveMilestones`, `validateMilestoneValue`), call sites that pass `yearGoalHours`, doc comments referencing "year goal".
  Why: Glossary picks **Annual Goal** as the canonical term; "year goal" is ambiguous between calendar year and Service Year. The number is identical (`monthlyGoalHours * 12`); only the name needs to converge.
  Touches: `milestones.ts` parameter names + JSDoc, every caller, any UI strings using "year goal".

- **Capability flag rename: `isPioneer` → `isInFullTimeService`**
  Source: [`src/lib/publisherCapabilities.ts:24`](src/lib/publisherCapabilities.ts:24) (`isPioneer: boolean` on `PublisherCapabilities`), [`src/lib/publisherCapabilities.ts:42`](src/lib/publisherCapabilities.ts:42) (`isPioneer` predicate), `PIONEER_PUBLISHERS` constant.
  Why: The flag is true for `regularPioneer`, `specialPioneer`, AND `circuitOverseer`, but a circuit overseer is not called a pioneer in JW vernacular. Glossary term is **Full-Time Service**, which exactly matches the grouping. No call sites want the strict pioneer-but-not-CO semantic, so the rename is mechanical.
  Touches: `PublisherCapabilities.isPioneer` → `isInFullTimeService`, `isPioneer` helper export, `PIONEER_PUBLISHERS` → `FULL_TIME_SERVICE_PUBLISHERS`, every consumer (settings, profile badges, gates).

- **Tenure model: split `pioneerStartDate` into per-Tenure-Type tracking with reset semantics**
  Source: [`src/stores/preferences.ts:249`](src/stores/preferences.ts:249) (`pioneerStartDate` field), [`src/lib/publisherCapabilities.ts:45`](src/lib/publisherCapabilities.ts:45) (`tracksPioneerStartDate`), [`src/constants/publisher.ts:23`](src/constants/publisher.ts:23) (`getStartDateLabels`).
  Why: Glossary defines two distinct **Tenure Types** — **Full-Time Service** (regular pioneer, special pioneer, circuit overseer) and **Auxiliary Pioneer** (regularAuxiliary) — each with its own clock. Today's single `pioneerStartDate` field cannot distinguish them and does not reset on cross-Tenure-Type role changes. The shape needs to model: (a) start date per Tenure Type or one start-date plus an active Tenure Type, (b) explicit reset on transitions to/from Regular Publisher, Custom, and across Tenure Types, and (c) UI labels per current Publisher (e.g. "circuit overseer (full-time service) since…" so the user understands their CO clock includes prior pioneering).
  Touches: preferences shape (MMKV migration), `setPublisher` action (must apply reset rules), iCloud sync mapping, `getStartDateLabels`, every UI surface that reads `pioneerStartDate` (profile badges, settings rows, onboarding step).

- **Type rename: `Conversation` → `Visit` (and the family)**
  Source: [`src/types/conversation.ts`](src/types/conversation.ts), the `conversations` feature folder, route names `Conversation Form` and `RescheduleConversation` in [`src/types/rootStack.ts`](src/types/rootStack.ts).
  Why: Glossary defines a **Visit** as a single field-ministry interaction with a Contact. Not every Visit is a real conversation (the `notAtHome` flag is proof). "Conversation" understates the type's actual scope.
  Touches: `Conversation` → `Visit`, `ConversationTombstone` → `VisitTombstone`, `conversations` feature folder name, route names, navigation calls, i18n keys (including UI strings like "Missed Conversations"), file/screen renames. Keep `isBibleStudy` and `notAtHome` as per-Visit fields — no logic change.

- **Type rename: `ServiceReport` → `TimeEntry` (and the family)**
  Source: [`src/types/serviceReport.ts:1`](src/types/serviceReport.ts:1).
  Why: Glossary defines **Service Report** = the monthly aggregate submitted to the congregation, and **Time Entry** = a single logged session. The TS type is the session, not the report.
  Touches: `ServiceReport` → `TimeEntry`, `ServiceReportTombstone` → `TimeEntryTombstone`, `ServiceYear` → `TimeEntriesByMonth`, `ServiceReportsByYears` → `TimeEntriesByYear`, plus every import. Screens named "ServiceReport\*" stay (they really are about the monthly Service Report aggregate).

## Done

_(none yet — move items here as they ship)_
