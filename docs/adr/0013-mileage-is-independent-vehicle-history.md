---
status: accepted
implementation: complete
---

# Mileage is independent history associated with Vehicles

## Context

[Issue #256](https://github.com/leviFrosty/witness-work/issues/256) requests distance accumulated through a month for reimbursement. Mileage has different reporting semantics from ministry time: the User selects eligible travel, associates it with a vehicle, and forwards a monthly distance total separately from the Service Report. Existing time Categories also carry Credit Time behavior that has no meaning for distance.

## Decision

The following domain decisions were settled in the September 4, 2026 design interview. The User authorized implementation; the final behavior is specified in [the implementation document](../mileage-design.md).

- A **Mileage Entry** is a dated distance record associated with one **Vehicle**. The User can enter distance directly or derive it from starting and ending odometer readings. History presents individual entries, which can be edited or deleted.
- Mileage is independent of **Time Entries**, **Plans**, and **Service Reports**. Logging or exporting mileage does not change ministry-time totals or time-report state.
- Every completed Mileage Entry is distance the User intends to report. The app does not classify travel eligibility or calculate reimbursement. External restrictions remain the User's responsibility and are only briefly acknowledged in copy.
- **Mileage Categories** are independent of time **Categories** and carry no Credit Time meaning.
- A User can maintain multiple Vehicles, and every Mileage Entry identifies its Vehicle. A new entry defaults to the last-used active Vehicle. A Vehicle has one name, optional informational combined MPG, and an emoji avatar. Referenced Vehicles and Mileage Categories are archived and restorable.
- Distance units are global, configurable in Appearance with a device measurement-system default. Store physical measurements without reinterpretation when units change; do not introduce per-Vehicle units.
- An odometer entry may be started and completed later. Unfinished entries persist but do not contribute to totals or reports. Period summaries omit odometer boundary readings entirely.
- A **Mileage Report** summarizes mileage for a calendar month, with text output and a category breakdown. Its submission preference is separate from the Service Report's preference.
- Mileage's Year view follows the September–August **Service Year**, matching Progress. This browsing period does not redefine external reimbursement periods or restrictions.
- Recorded distance is uncapped. Mileage has no goals, projections, milestones, performance deltas, fuel-price integration, fuel-purchase log, or reimbursement calculation.
- Mileage is reached through a summary card in Progress that opens a dedicated Mileage screen in the selected period. Back preserves the User's place in Progress. This is prototype B, selected by the User; the stacked Time/Mileage selector was removed. Map retains its own bottom tab; there is no additional Mileage tab. Default mileage enablement is on for special pioneers and circuit overseers and off for other Publishers, with an explicit override available to every User. Only the onboarding offer is restricted to the two default-on Publishers.

## Consequences

- Share presentation patterns and appropriate UI components while keeping time and mileage calculations independent.
- Do not treat the difference between widely separated odometer readings as the sum of reportable entries: unrecorded driving can occur between trips.
- Vehicle and category identity survive edits, archival, and history retrieval. Copying/sharing mileage never sets time submission state or claims that reimbursement was submitted.
- Persistence, backups, and iCloud Sync must carry entries together with the Vehicles and Mileage Categories they reference.
- User-facing wording should acknowledge applicable restrictions without reproducing institutional instructions or claiming that the app determines eligibility.
