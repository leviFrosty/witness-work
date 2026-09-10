# UI consistency audit: plans, reports, progress, home, milestones, and import

This audit covers the owned feature surfaces and the app tier. The common form
language is the shared input layout: page padding 12pt, inset rounded groups,
rows with a 76pt minimum height and 12pt horizontal row padding, controls with
an outlined treatment, and bounded selects/fields (maximum 200pt). Boolean
actions and import selections use native switches with accessible switch state.

## Interactive surfaces

| Surface                           | Inputs / actions                                                                                                           | Treatment                                                                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plan Day                          | date, plan kind, type/category, recurrence, weekday, end date, note, duration, notifications, recurring save scope         | Uses the shared input layout; duration fields are stacked to preserve label space on narrow phones.                                                    |
| Add Time / Update Time            | date, type/category, hours, minutes, note, submit, delete                                                                  | Uses the shared input layout; duration fields are stacked.                                                                                             |
| Schedule                          | month navigation, calendar mode, plan/time selection, add/edit actions, monthly goal sheet                                 | Calendar is display-oriented; navigation and actions remain compact. Goal editing is reviewed with the service-report sheet.                           |
| Selected Date sheet               | add time, add/edit plan, edit report                                                                                       | Action list; no free-form fields.                                                                                                                      |
| Month Goal editor sheet           | monthly goal field, use regular goal, save                                                                                 | Directly outlined and bounded numeric field (200pt maximum); measured values use the time formatter.                                                   |
| Service Report month view         | month navigation, report calendar, add/update/delete time, report submission, rollover action, insights, editable comments | Display/reporting surface; publisher participation uses a native switch action and the comments edit state uses a full-width paper-themed outline.     |
| Add Earlier Year sheet            | service year selection and confirmation                                                                                    | Selection/action surface; no text input.                                                                                                               |
| Rollover                          | auto rollover switch, apply, dismiss                                                                                       | Native switch retained for a boolean preference; fractional totals use the time formatter.                                                             |
| Onboarding Backfill               | month rows with standard and credit-hour fields, continue, skip                                                            | Outlined bounded numeric fields; two fields remain separate because they represent distinct report categories.                                         |
| Progress month/year/all-time tabs | month navigation, year navigation, milestone entry point, add-earlier-year, milestone editor                               | Primarily display surfaces; milestone numeric fields are outlined and constrained.                                                                     |
| Milestone adjustment sheet        | add/remove/step milestone, numeric milestone fields, reset, done                                                           | Numeric fields have outlined treatment; deletion/reset remain explicit destructive actions.                                                            |
| Milestone showcase                | close, skip, see what's new, navigation through reveal                                                                     | Presentation surface; decorative device mockups and animation are intentionally not form rows.                                                         |
| MyTime import                     | choose file, preview selection, confirm, choose another, import another                                                    | Preview rows use native switches with accessible checked state; time summary uses the time formatter.                                                  |
| Home                              | home cards, timer/report actions, missed visits, recommendations                                                           | Orchestrator only; child domain controls own their visual treatment.                                                                                   |
| Drawer navigation                 | navigation rows, preferences rows, sections                                                                                | Existing approved drawer treatment is preserved: 48pt rows, 2pt gaps, 40pt section spacing, aligned labels.                                            |
| Tools screen (development only)   | switches, date picker, numeric mock-data field, actions, destructive reset controls                                        | Development surface; native switches and date pickers remain appropriate. Mock-contact count is directly outlined, 44pt minimum, and bounded to 200pt. |

## Display-only or non-form surfaces

`ProgressMonthTab`, `ProgressYearTab`, `ProgressAllTimeTab`, `LifetimeHoursCard`,
`YearByYearList`, `YearCategoryBreakdownSection`, `ScheduleInsights`,
`CalendarKey`, `MonthTimeReportsCalendar`, `AllDaysList`, `DayHistoryView`,
`MonthReport`, `GoalProgressStats`, `MonthServiceReportProgressBar`,
`CategorySegmentBar`, `TimeCategoryTableRow`, `TimeReportRow`, `CreditBadge`,
`CreditInfoSheet`, `ServiceReportInsightOverlay`, `ServiceReportStudiesOverlay`,
`WeekStripTeaser`, `TimerSection`, `ServiceReportSection`, and the home
orchestrator render data or expose navigation/action buttons without free-form
input. Their time values must continue to use the canonical minute-formatting
helpers.

The app-tier sync code (`src/app/sync/**`) and widget builders
(`src/app/widgets/**`) are noninteractive serialization/snapshot code. They do
not render form controls. `DeepLinkListeners`, `App`, paywall/notes-import route
wrappers, and navigation stacks are routing/hosting surfaces and do not need
input-row styling.

## Scope notes

- Shared primitives and settings/preferences are documented in the shared
  settings audit; this document does not duplicate their implementation.
- Contact, visit, conversation, map, profile, notes import, onboarding,
  supporter, and updates surfaces are documented in the contact and form audit.
- Native date pickers and native switches are retained where they represent
  platform-native date/boolean controls. Wheel selects retain their existing
  interaction model while inheriting the surrounding row layout.
- Publisher capability gates, report math, category credit semantics, rollover
  behavior, and stores were not changed by this UI pass.

## Verification

The repository-wide input, `Section` child, route, and sheet inventory is
complete; Astra max found no unknown input groups. Final checks pass: lint,
typecheck, 88 test files with 1,216 tests, dependency validation with no
circular dependencies, and `git diff --check`.

Runtime verification covered dark ProMax drawer and Publisher states, normal
and error Contact name outlines, native switches, and light 390pt iPhone 17e
Onboarding, Profile, Add Time, compact Type/Hours/Minutes controls, 44pt
controls, 80pt full-width notes, wheel-picker modal, and Custom Fields
composition. The installed simulator dev binary kept a native splash overlay
above the live React tree; the reviewer temporarily hid only that
noninteractive splash view for inspection, without a source or store change.
Clean native launch was not validated, and representative states do not cover
every interaction.
