# Mileage Tracking — PRD

Status: v1 in progress · Owner: Levi · Last updated: 2026-10-03

## Problem

Special full-time servants and Bethelites report mileage to the branch, which
calculates reimbursement from distance traveled and the car's fuel economy.
Other publishers track mileage for tax write-offs or personal records. Today
they keep a separate notebook or app. WitnessWork should let them log a trip in
a few taps and hand off a monthly figure without mental math.

## Goals

- Log a trip in under 10 seconds from the Add button or the Home card.
- See distance, trip count, and an estimated fuel cost for any day, week, month,
  or service year.
- Share a report as text (copy / share sheet) or export a CSV.
- Stay isolated: no Buddies, Calendar, Plans, or Service Report integration.

## Non-goals (v1)

- GPS / automatic trip detection, maps, routes.
- Trip purpose/category, tolls, parking, or other extra costs.
- Saved places / favorite trips (the row's **Log Again** covers repeats).
- Per-trip rate overrides, widgets, Live Activities.

## Audience and availability

- Off by default for every role. Any publisher type can opt in.
- Home shows a one-time **Track mileage?** prompt to every publisher until they
  answer. **Yes** enables the feature; **No thanks** hides the prompt for good.
- Toggle lives in Settings → Preferences → Publisher (`PublisherPreferencesSection`).
- Free. Data follows existing sync rules: iCloud sync on iOS for Supporters with
  sync enabled; JSON backup on both platforms. Android works fully offline.

## Concepts

| Term               | Meaning                                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Car**            | User-named vehicle ("Mazda CX-5"). Can be archived.                                                                                                                   |
| **Fuel**           | User-named fuel ("Gasoline", "Diesel", "Electric") with a price history. Global — a price change applies to every car using that fuel.                                |
| **Fuel price**     | Effective-dated price per gallon (US) or litre.                                                                                                                       |
| **Car fuel setup** | Effective-dated pairing of a car with a fuel and a fuel economy. Both optional.                                                                                       |
| **Trip**           | One drive: date, car, distance (or odometer start/end), round-trip flag, optional note.                                                                               |
| **Estimated cost** | `distance ÷ fuel economy × fuel price`, using the setup and price in effect on the trip's date. Hidden when economy or price is missing. Always labelled an estimate. |

### Effective-dated history

Fuel prices and car fuel setups are histories, never overwritten in place by a
normal edit:

- **Starting [date]** (default today) adds an entry; trips before that date keep
  the old value.
- **Correct current value** rewrites the entry in effect today (fixes a typo).
- Lookup picks the newest entry whose `effectiveFrom ≤ trip date`. Trips dated
  before the first entry use the first entry, so a newly added car or fuel
  applies to trips logged retroactively.
- Trips never store a rate; cost is derived at read time. Histories are tiny,
  so lookup is a binary search over a cached, sorted array.

## Units

- **Distance:** miles or kilometres. Default from device region (mi for US, GB,
  LR, MM; km elsewhere).
- **Fuel economy:** mpg (US), mpg (UK), L/100 km, or km/L. Default from region.
  Price unit follows: per US gallon for mpg (US), per litre otherwise.
- **Currency:** device locale currency, no picker.
- **Storage:** canonical — miles, US mpg, price per US gallon. Conversion is
  display-only, so changing units never rewrites data.

## Experience

### Home

- **Prompt card** (top, under the checklist) while the user hasn't answered.
- **Mileage section** (when enabled), a reorderable/hideable Home section:
  - No cars: empty state with **Add Your First Car**.
  - Otherwise: this month's distance, trips, estimated cost (or an
    "Add a fuel price to estimate cost" hint), and a **Log Trip** button.
  - Tap → Mileage screen. Long-press → Log Trip, Mileage Settings, Hide, Customize.

### Add button

**Log Trip** quick action when enabled. With no active car it opens the car form
first, then the trip form.

### Mileage screen

- Header: share menu (Copy / Share / Export CSV) and settings gear.
- Period segmented control: Day / Week / Month / Year (service year). Arrows and
  swipe move between periods. Week follows the Start of Week preference.
- Summary: distance, trips, estimated cost; per-car breakdown with more than one
  car.
- Trip list, newest first. Tap → Trip Details. Long-press → Edit, Log Again,
  Share, Delete. Swipe → Delete. Every delete confirms.

### Trip form (modal)

Date (no future dates) · Car (hidden with one active car; defaults to the most
recently used) · **Distance | Odometer** mode (remembered):

- Distance: distance + Round Trip toggle (doubles it).
- Odometer: Start (prefilled from the car's latest end reading before the date)
  and End; End must exceed Start.

Note (optional). Save. Edit mode adds Delete. No Cancel button (sheet dismisses).

### Trip Details

Date, car, distance, round trip / odometer readings, note, fuel economy and price
used, estimated cost. Header: Edit, Share, Delete.

### Mileage Settings

- Cars (active), Archived Cars, Add Car.
- Fuels with current price, Add Fuel.
- Units: distance, fuel economy.
- Delete All Mileage Data (destructive, confirmed).

### Car form

Name (required) · Fuel (optional picker, can add a fuel inline) · Fuel economy
(optional). Editing fuel or economy asks **Starting [date]** vs **Correct current
value**, and lists the setup history (edit/delete entries). Delete offers
**Archive** (keeps trips in reports) or **Delete Car and N Trips**.

### Fuel form

Name (required, placeholder "Gasoline") · Price (optional). Editing the price
asks **Starting [date]** vs **Correct current value** and lists price history.
Delete warns that cars using the fuel stop showing an estimated cost.

### Sharing

- Report text: title, period, totals, per-car totals, and a trip list for Day,
  Week, and Month (totals only for Year).
- CSV: one row per trip in the period — date, car, odometer start/end, distance,
  unit, round trip, note, fuel, fuel economy, fuel price, estimated cost.
- Trip text: date, car, distance, note, estimated cost.

### Turning it off

Hides the Home section, prompt, quick action, and screens. Data stays and keeps
syncing. Turning it back on restores everything.

## Data model

New shared-tier store `src/stores/mileage.ts` (`mileage` persist key) and types in
`src/types/mileage.ts`:

```ts
Vehicle         { id, name, archived?, createdAt, updatedAt }
Fuel            { id, name, createdAt, updatedAt }
FuelPrice       { id, fuelId, effectiveFrom, pricePerGallon, updatedAt }
VehicleSetup    { id, vehicleId, effectiveFrom, fuelId?, milesPerGallon?, updatedAt }
Trip            { id, vehicleId, date, distanceMiles, roundTrip?,
                  odometerStartMiles?, odometerEndMiles?, note?, createdAt, updatedAt }
MileageTombstone { id, deletedAt }
```

Dates are `YYYY-MM-DD` local calendar strings. UUIDs are global, so one
tombstone list covers every collection.

Preferences (synced): `mileageTrackingEnabled` (`undefined` = unanswered),
`distanceUnit`, `fuelEconomyUnit` (`undefined` = Auto), `mileageEntryMode`.
Home key: `mileage`.

## Sync and backup

- Optional `mileageStore` slice on the iCloud payload (no version bump; older
  builds ignore it, newer builds default it to empty).
- Merge: `mergeById` LWW per collection + shared tombstones (`applyTombstones`).
- Wired through `payload.ts`, `payloadValidation.ts`, `merge.ts`,
  `foldRemotePayloads.ts`, `iCloudSync.ts`, and `backupFile.ts`.

## Analytics

Documented in `docs/analytics.md` → Mileage. No car names, fuel names, notes, or
amounts — only counts, booleans, units, and enums.

## Help Center

New FAQ category **Mileage**: getting started, units, estimated cost and fuel
prices, sharing/exporting, cars (archive vs delete), sync and Android, turning it
off.

## Open questions / v2

- Odometer-only mode per car, purpose tags, tolls/parking, saved places.
- PDF export, per-period submitted state.
- Translations (en-US only until the release cut translates them).
