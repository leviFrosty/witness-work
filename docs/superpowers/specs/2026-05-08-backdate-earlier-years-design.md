# Backdate Earlier Years on All-Time Tab

## Problem

The All-time tab's `YearByYearList` renders a continuous span from the earliest
service report through the current service year. Users with historical pioneer
service from before they started using the app have no way to extend the list
backward — there is currently no UI to introduce an earlier service year.

This blocks users (especially long-time pioneers) from filling in their full
historical record, which feeds the avatar overlay's lifetime stats.

## Goal

Let a user add an arbitrary earlier service year to the All-time view so that:

- The new year appears as a row in `YearByYearList`.
- Every intermediate year between the new earliest and the prior earliest also
  appears (the existing continuous-span behavior already handles this once a
  placeholder exists at the new floor).
- The user can tap into any of those years and add real reports later.

## Non-Goals

- No changes to the per-year (Year tab) screen.
- No special "delete a placeholder year" UI. If the user adds the wrong year,
  they can delete the zero-hour placeholder report through the existing
  month/report flow.
- No bulk import or CSV.
- No backfill wizard.

## UX

### Trailing "+ Add earlier year" row

Appended to the bottom of `YearByYearList`, styled like a real year row (same
card background, padding, and border radius — no dashed treatment, no separator
above it). The row's content:

- Left: `+` icon + label `addEarlierYear` (i18n key, English: `"Add earlier year"`).
- No bar, no hours value.
- Tappable, with the same press feedback as other rows.

When zero reports exist the All-time tab shows its existing empty state and
this list (and therefore the trailing row) does not render. Whenever the list
renders, the trailing row appears as the last item — unless every available
year is already in the rendered span (see "At the 100-year floor" below).

### Year picker sheet

Tapping the row opens a bottom sheet containing:

- A single iOS `Picker` wheel.
- Wheel items are service years formatted as `"{startYear}-{endYear}"` using
  full four-digit years separated by an ASCII hyphen, e.g. `"2016-2017"`.
  (Note: this is intentionally different from the row label format
  `"2016—17"` — the picker is unambiguous about both endpoints.)
- **Range:** `currentEndYear - 100` through `earliestEndYear - 1`, inclusive,
  most-recent first. (`currentEndYear` is the service year ending in the
  current calendar year per existing service-year math.)
- **Default selection:** `earliestEndYear - 1` (one year before the current
  earliest — the most common case).
- A primary "Add Year" button. A "Cancel" / dismiss action closes the sheet
  without changes.

If the computed `availableEndYears` list (see Edge Cases) is empty — i.e. the
user has already filled every year back to the 100-year floor — the trailing
row is hidden.

### Seed behavior

On confirm, insert exactly one `ServiceReport` into the store:

- `id`: fresh uuid (use the same uuid utility used elsewhere in
  `stores/serviceReport`).
- `hours: 0`, `minutes: 0`.
- `date`: **September 1 of the picked `startYear`** at 12:00 local time.
  September 1 is the canonical start of a JW service year; noon avoids any
  DST edge case that could shift the date by a day.
- `updatedAt`: `Date.now()` so iCloud sync picks it up.
- All other optional fields (`tag`, `note`, `ldc`, `credit`, `rollover`,
  `rolloverGroupId`) omitted.

No deduplication is performed. If the user picks a year that already has
reports (defensive — the picker excludes such years), a 0-hour placeholder is
harmless: `getHoursForServiceYearEndYear` sums them and 0 contributes nothing.

After insertion the sheet dismisses and `YearByYearList` re-renders with the
expanded span.

## Implementation Notes

### Files touched

- `src/components/YearByYearList.tsx` — append trailing row; manage sheet
  open state; render `<AddEarlierYearSheet />`. Compute floor and exclude
  already-present years from picker options.
- `src/components/AddEarlierYearSheet.tsx` (new) — bottom sheet with picker
  - confirm. Accepts `availableEndYears: number[]` and `onConfirm(endYear)`.
- `src/stores/serviceReport.ts` — add (or reuse) an action to append a
  single report. If a suitable action already exists (`addServiceReport` or
  similar), reuse it; do not invent a new one.
- `src/lib/locales/translations/*.json` — add `addEarlierYear` and
  `addYear` (button label) keys; auto-translate via existing tooling.

### Bottom sheet library

Use whatever bottom-sheet component the rest of the app uses
(`@gorhom/bottom-sheet` or the project's wrapper). Match the look of existing
sheets in the codebase rather than introducing a new one.

### Picker

Use `@react-native-picker/picker` if already a dependency; otherwise use
the project's existing wheel-picker abstraction. A single-column wheel,
not a date picker.

### LifetimeHoursCard span metadata

Verify that the card's "since {year}" text reads from the earliest report
date. If it reads from a hardcoded floor, adjust to use earliest report.
(This is expected to already be correct; flag during implementation if not.)

### Edge cases

- **Picker excludes years already in the rendered span.** Compute
  `availableEndYears = range(currentEndYear - 100, earliestEndYear - 1)`
  filtered to remove any year already present in `endYears`.
- **No reports exist:** the All-time tab's empty state takes over before
  `YearByYearList` renders, so the trailing row is never seen in the
  empty state. No special handling needed.
- **At the 100-year floor:** trailing row hidden.

## Testing

- Unit: store action correctly inserts the placeholder under
  `serviceReports[startYear][8]` (month index 8 = September).
- Component: tapping trailing row opens sheet; confirming with selected
  year results in a new row appearing in the list.
- Manual: on iOS device — verify wheel feel, sheet animation, that the
  newly added year is tappable into the Year tab, and that lifetime
  stats on the avatar overlay update accordingly.

## Open Questions Resolved

- **Floor:** 100 years prior to current service year.
- **Picker label format:** `"2016-2017"` (full years, ASCII hyphen).
- **Row treatment:** real-year styling, no separator.
- **Removal flow:** out of scope; users delete the placeholder via the
  existing month/report UI.
