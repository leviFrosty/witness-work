# Mileage tracking — implementation specification

Status: implemented and verified on September 4, 2026. The user approved the final decisions and authorized orchestration of implementation slices without further questions.

Source: [GitHub issue #256](https://github.com/leviFrosty/witness-work/issues/256) and the accompanying design interview. This document describes the final decisions, superseding earlier interview recommendations.

## Product behavior

### Enablement and placement

- Any User can enable mileage in Publisher Preferences using Default / On / Off.
- Default is on for special pioneers and circuit overseers, off for all other Publishers. Publisher changes affect Default; explicit On/Off persists.
- Disabling mileage hides its surfaces and preserves all vehicles, entries, categories, and preferences.
- The onboarding offer appears only for special pioneers and circuit overseers. This is an onboarding restriction, not feature eligibility. Other Users can enable and set up mileage later.
- Map retains its own bottom tab. Do not add a Mileage bottom tab or shrink existing icons.
- Mileage is reached through a card below the time summary in Progress. The User selected prototype B (Progress card), replacing the Time/Mileage segmented control. The card opens a dedicated Mileage screen; Back returns to the same Progress view. Month, Service Year, and All Time cards show and open the corresponding mileage period. If a checkbox-mode Publisher enables mileage, Progress shows the mileage card without time goals or time-only content.
- Card hierarchy: Mileage heading and chevron, prominent distance with a smaller unit, then quieter period and vehicle-count metadata. Surface any unfinished trips without adding their distance to the total. The entire card is a single navigation action.
- Add Mileage appears immediately below Add Time in the universal quick-action sheet when enabled. If Add Time is absent, Add Mileage is the first action.
- Offer Vehicle setup from the mileage empty state and Preferences as well as onboarding. Setup can be skipped; creating an entry requires a vehicle.

### Vehicles

- Multiple Vehicles are supported; every Mileage Entry references one Vehicle.
- One required name field, with localized example placeholder using the current year: "e.g., 2026 Toyota Corolla". Name and description are the same field; there is no separate nickname.
- Optional positive numeric **Combined MPG** field. Explain that it is informational and should match the User's combined MPG record. Do not estimate, convert, or use it to calculate reimbursement. Do not add fuel-price APIs or fuel-purchase logging.
- All Users can choose an emoji avatar. Supporters can customize the avatar background color, using the existing access rules and shared Avatar/picker/color components. Restrict the vehicle picker to emojis; no photo storage or photo-sync scope is needed.
- New entries default to the last-used active Vehicle. If it is unavailable, use the first active Vehicle; if none exists, guide the User to create one.
- Archive Vehicles with history instead of deleting them. Archived Vehicles preserve historical labels and totals, disappear from new-entry choices, and can be restored. Only unused Vehicles may be permanently deleted.
- Management exposes active and archived Vehicles and lets Users edit their name, combined MPG, and avatar. Vehicle changes never alter recorded distance.

### Distance preferences and precision

- A global distance preference lives in Appearance Preferences: Auto / Miles / Kilometers. There is no per-Vehicle unit preference.
- Auto follows the device measurement setting: metric means kilometers; US/UK means miles. An explicit app distance choice wins. The app's date Format Region does not override this independent setting. If the native measurement system is unavailable, use kilometers as the conservative fallback.
- Verified against [official Expo Localization documentation](https://docs.expo.dev/versions/latest/sdk/localization/) and installed expo-localization 57.0.0: `getLocales()[0].measurementSystem` provides metric/us/uk/null. iOS reads `Locale.current`, independently of preferred language.
- Store numeric measurements canonically in meters, retaining sufficient precision for conversions. All input fields and displayed distance/odometer values use the resolved global unit. Unit changes convert values; they never reinterpret an existing numeric reading as another unit.
- Accept locale-appropriate decimal entry, reject malformed/non-finite/negative values, and require positive completed distance. Display up to two fractional digits without forced trailing zeros. Sum unrounded values and round for presentation only.

### Mileage Entries

- A dated record of distance the User intends to report for reimbursement. Every completed entry counts; the app does not classify eligible versus personal driving.
- Required fields: date, Vehicle, and either direct distance or odometer data. Optional fields: Mileage Category and note.
- Date defaults to today and can be backdated. It remains the User-selected incurred date; timezone changes must not move it to another day. Reject future incurred dates.
- Direct-distance mode saves a completed entry.
- Odometer mode can save a starting reading alone, then finish later with an ending reading. An unfinished entry survives restarts and is excluded from totals/reports.
- Completed odometer distance is ending minus starting reading; ending must be greater than starting. Do not enforce continuity between separate trips because unlogged driving can happen in between.
- Allow one unfinished odometer trip per Vehicle; surface it for completion instead of silently starting a duplicate. Different Vehicles can have separate unfinished trips.
- An unfinished trip keeps its chosen incurred date when finished, including across a month boundary; the User can correct the date. No automatic splitting across months.
- Remember the last-used Vehicle and entry mode. An edit must preserve unrelated fields and metadata. Deleting an entry requires a clear destructive confirmation and persists a tombstone for sync.
- Month history is **per entry**, newest date first with stable creation-order tie-breaking. Tapping an entry opens editing directly. Show date, distance or in-progress state, Vehicle, and category/note where useful. Do not create rows for empty days.
- In-progress entries have an obvious resume surface, including when their date is in a different month.

### Mileage Categories

- Separate from time Categories; no Credit Time properties or relationships to Time Entries/Plans.
- Optional selection; category creation is available in the entry form. Start without an official seeded taxonomy. Include uncategorized distance in totals and breakdowns.
- Rename or archive referenced categories, preserving their history. Archived categories disappear from new-entry choices and can be restored; unused categories can be permanently deleted.
- Category and vehicle renames update labels on current historical views without changing distances. Archived references remain readable and are retained when editing their existing entries unless explicitly replaced.

### Progress and summaries

- Preserve existing typography, cards, spacing, period controls, gestures, and theme tokens.
- Month: completed-distance total, individual entry history, clear add/resume actions, vehicle filtering, and a category breakdown sheet.
- Year: September–August **Service Year**, total distance and simple month-total rows that open Month.
- All Time: lifetime distance and Service-Year-total rows that open Year. Do not add year backfill placeholders or destructive bulk-year actions inherited from time Progress.
- Category breakdown is available for the selected period in all three views, with vehicle filtering applied consistently. Defaults to all Vehicles.
- Do not show any monthly/yearly starting or ending odometer figures. Odometer readings belong only to individual entries.
- No mileage goals, caps, projections, milestones, achievement celebrations, or month-to-month performance deltas.
- Reuse `SwipeMonthNavigator`; extract other shared visual controls only where the same behavior is actually used. Keep mileage aggregation independent of time/report-cap calculations.

### Mileage Report

- Separate monthly report with the existing report design/typography and its own month navigation.
- Text output: month and year, total mileage with unit, then per-Vehicle totals and Mileage Category breakdowns within each Vehicle. Include uncategorized distance where present. Exclude unfinished entries.
- Report defaults to all Vehicles and may show the selected Vehicle filter explicitly. Include archived Vehicles when they have entries in scope.
- Example shape: "September 2026 — Mileage\nTotal: 248.6 mi\n2026 Toyota Corolla: 248.6 mi\n Congregation: 180 mi\n Uncategorized: 68.6 mi". Actual labels are localized.
- Independent Copy / Share preference in Publisher Preferences. Copy and Share use this summarized string, not a numeric-only shortcut. No external-app links, portal integration, or file export.
- Copy/Share confirms the completed action and never marks a Service Report or reimbursement request submitted. Share cancellation does not show a success message. No new submission-state/reminder system.
- Briefly acknowledge external restrictions, without reproducing the supplied institutional eligibility lists, thresholds, deadlines, or procedures. Suggested copy: "Reimbursement rules and limits may apply. Log only eligible travel and check your current branch guidance before submitting."
- The Service Year display is a browsing convention; it does not assert compliance with external calendar-year reimbursement rules.

## Persistence and integration

- New shared domain types/helpers/store under `src/types`, `src/lib`, and `src/stores`; mileage UI under `src/features/mileage`. Follow the three-tier boundaries.
- Use durable identity, created/updated timestamps, and tombstones for entries, vehicles, and mileage categories. Archive is an ordinary record update.
- Retain mileage tombstones without age-based pruning while stale per-device files can still contain deleted records. Safe deletion requires a peer watermark; the existing time-store retention policy is unchanged.
- Include all mileage records and references in manual JSON backup/restore and iCloud Sync. Existing backups without mileage data preserve local mileage. Missing slices in older sync payloads do not mean deletion.
- Include mileage in meaningful-local-data detection, subscriptions, merge/fold/replacement paths, and existing conflict-resolution flows. Verify old-client compatibility; do not assume the proposed schema registry exists.
- Preserve normal Supporter gating for iCloud Sync. Mileage enablement is independent of Supporter status; vehicle background customization follows existing Supporter access behavior.
- No ww-api change or third-party Notes/MyTime mileage import is required.
- Only edit `en-US.json`; other translations require human approval and use existing fallback behavior.

## Slice ownership and contracts

- **Entries slice:** shared mileage types, store and pure measurement/domain helpers; entry/category editing and resume flow; meaningful domain/store tests.
- **History/report slice:** Mileage dashboard/report components and screens; Progress integration, routes and quick-action entry point; summary/export tests.
- **Setup slice:** mileage Publisher/Appearance preferences and capability seam, vehicle editor/manager, avatar component extension, onboarding integration; relevant capability tests.
- **Orchestrator:** cross-slice review, backup/iCloud wiring and compatibility tests, merging English translation fragments, docs, and final verification.
- The entries owner publishes exact shared store/type interfaces early to the other owners. Coordinate shared-file edits; never overwrite another slice's work.

## Acceptance checks

- Default/On/Off works across Publisher changes; disabling/re-enabling preserves data; checkbox-mode users can access mileage.
- Create/edit/archive/restore a Vehicle and category; last-used Vehicle default is correct; referenced history survives.
- Log/edit/delete direct distance and odometer entries; persist and finish an incomplete trip; invalid readings never corrupt totals.
- Change global units without changing physical totals; verify decimals and cross-unit round trips.
- Verify per-entry ordering, month and Service Year boundaries, all-time drill-down and category/vehicle filters. In-progress trips never enter totals.
- Report output reconciles total, per-Vehicle, and category amounts; Copy/Share is independent of time submission.
- Backup/restore and iCloud merge preserve entries, references, archives, tombstones, and older payload behavior.
- Run `pnpm run testFinal`, `pnpm run lint`, and `pnpm run typecheck`; inspect the integrated app in a simulator where available.

## Verification

The navigation decision and original alternatives are preserved in the [prototype branch README](https://github.com/leviFrosty/witness-work/blob/mileage-placement-prototype/src/features/progress/prototypes/README.md), commit `64e60873`. The User accepted placement/navigation and requested improved card typography; the native card implements that refinement.

- `pnpm run testFinal`: 95 test files and 1,242 tests passed. Coverage includes publisher defaults and overrides, decimal parsing and unit conversion, entry validation, store lifecycle, period summaries, report text, backup validation, and iCloud compatibility/conflict handling.
- `pnpm run lint` and `pnpm run typecheck` passed.
- iPhone 17 Pro Max simulator: created a Vehicle with combined MPG, logged direct distance, created a Mileage Category, saved an unfinished odometer trip, reloaded the app, resumed and completed that trip, and verified separate entry rows and reconciled totals across Month, Service Year, All Time, category breakdown, and Mileage Report. Copy Summary confirmed completion; quick actions retained Add Time followed by Add Mileage, and Map retained its tab.
- Simulator testing exposed a Hermes build without `Intl.NumberFormat.formatToParts`. Mileage and MPG input formatting now use supported formatting APIs, with a regression test reproducing that runtime limitation.
- Backup/iCloud behavior was verified through automated integration tests; live multi-device iCloud transport and App Store builds were not exercised in this change.
