---
name: publisher-capabilities
description: Rules for working with the Publisher role in WitnessWork — entry mode, goals, credit cap, milestone ladder, tenure display, and which sections render. Use whenever code reads or branches on a publisher/role, touches goals/credit-cap/milestones/tenure, gates UI by role, or adds a new role. CONTEXT.md has the role semantics; this is the code-level seam.
---

# Publisher capabilities

The `Publisher` role drives entry mode, goals, credit cap, milestone ladder, tenure display, and which Home/Progress sections render. Treat it as a first-class domain concept. See `CONTEXT.md` for role _semantics_; this skill is the _code_ contract.

## Defaults table

| Role               | Monthly (h) | Entry    | Annual goal | Credit cap | Tracks start | Milestone ladder        |
| ------------------ | ----------- | -------- | ----------- | ---------- | ------------ | ----------------------- |
| `publisher`        | 0           | checkbox | no          | 55h        | no           | —                       |
| `regularAuxiliary` | 30          | hours    | no          | 55h        | yes          | —                       |
| `regularPioneer`   | 50          | hours    | yes         | 55h        | yes          | 30, 50, 100, 200, 350   |
| `circuitOverseer`  | 50          | hours    | yes         | unlimited  | yes          | 100, 200, 300, 400, 500 |
| `specialPioneer`   | 100         | hours    | no          | unlimited  | yes          | —                       |
| `custom`           | user (50)   | hours    | yes         | 55h        | no           | —                       |

Sources: `src/constants/publisher.ts`, `src/stores/preferences.ts`, `src/lib/publisherCapabilities.ts`, `src/lib/milestones.ts`.

## Single seam: `derivePublisherCapabilities`

`src/lib/publisherCapabilities.ts` is the **only** place role behavior is encoded.

- **React code** reads via the `usePublisher()` hook (`src/hooks/usePublisher.ts`) — it wires the preferences store and adds a localized `displayName` fallback.
- **Pure / non-React callers** (widget snapshot builders, `adjustedMinutesForSpecificMonth`, onboarding step gates) call `derivePublisherCapabilities` or the small helpers directly: `getEntryMode`, `isInFullTimeService`, `getTenureType`, `tracksTenure`, `effectiveHasAnnualGoal`, `creditCapMinutesFor`.

Resolved capability flags callers read: `entryMode`, `hasAnnualGoal`, `isInFullTimeService`, `tenureType`, `tracksTenure`, `showsTimer`, `showsYearTabs`, `creditCapMinutes`, `hasUnlimitedCreditDefault`.

## Rules

1. **Never branch on the publisher string.** `if (publisher === 'specialPioneer')` is wrong — add/use a capability flag (`entryMode`, `hasAnnualGoal`, `isInFullTimeService`, `tenureType`, `tracksTenure`, `showsTimer`, `showsYearTabs`, `creditCapMinutes`, `hasUnlimitedCreditDefault`). Extend the type if a new one is needed.
2. **Capabilities fold in user overrides** (`userSpecifiedHasAnnualGoal`, `overrideCreditLimit` + `customCreditLimitHours`, `milestoneOverrides`). Read the resolved value; don't re-derive it.
3. **Gate UI on capabilities, not role.** Timer on `showsTimer`, Year tab on `showsYearTabs`, tenure row on `tracksTenure`, checkbox-vs-hours rendering on `entryMode`.
4. **`publisher` role = checkbox mode.** Anything assuming hours breaks. Check `entryMode` / `hasAnnualGoal` / `showsTimer` before reaching into hours-mode paths.
5. **Credit cap** → `creditCapMinutesFor()`. Never inline the 55h constant (`monthCreditMaxMinutes` in `src/constants/serviceReports.ts`); never re-implement the override math. Default is 55h for everyone except `specialPioneer` and `circuitOverseer` (unlimited).
6. **Milestone final rung** (the annual goal) is appended at read time by `getEffectiveMilestones`, never stored. Roles with `hasAnnualGoal === false` get an empty ladder. `custom` keeps an empty default ladder — respect `milestoneOverrides`, don't hardcode.
7. **`tenureStartDate` field** stores the **Tenure Start Date** for any role where `tracksTenure === true` (= `tenureType !== null`). Reset semantics live in `setRole` — flipping to a different Tenure Type (including any move to/from a no-Tenure-Type role like Regular Publisher or Custom) clears the field. Labels via `getStartDateLabels`.
8. **Adding a role** = touch the tuple in `src/constants/publisher.ts`, defaults in `src/stores/preferences.ts`, `baseCreditCapMinutes` + `roleDefaultHasAnnualGoal` + the `getTenureType` switch in `src/lib/publisherCapabilities.ts`, `DEFAULT_MILESTONES_BY_PUBLISHER` in `src/lib/milestones.ts`, the selector in `src/components/PublisherTypeSelector.tsx`, `getStartDateLabels` if it has tenure, and i18n in `en-US.json`. TS exhaustiveness catches most.
