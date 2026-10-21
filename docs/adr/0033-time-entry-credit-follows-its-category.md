---
status: proposed
---

# A Time Entry's Credit Time follows its Category

## Context

A Category's `isCredit` says whether time in that Category counts as Credit Time. Plans already read it at read time and store no copy (ADR 0005).

Time Entries still store a `credit` flag, and the totals read that flag instead of the Category:

- the month breakdown and service-year breakdown in `src/lib/serviceReport.ts`
- the report's credit lines in `monthReportData.ts`
- the year breakdown by Category
- the credit badge on an entry row

Keeping the copy right takes two extra mechanisms:

- **Restamping.** Turning a Category's Credit switch on or off restamps every entry in that Category with a new `updatedAt` (`restampTimeEntriesCredit`). Every one of those entries then syncs again.
- **Normalizing.** After any change to Time Entries or Categories, each device rewrites stale flags without stamping them (`useTimeEntryCreditNormalization`). This is needed because an entry saved on a device that hadn't yet pulled the Category change is newer, so it wins the merge everywhere, and it carries the old flag.

The copy still drifts:

- Until normalization runs, totals read the stale flag.
- The Time Entry form keeps an entry's stored flag when the entry is edited.
- Notes Import ORs the source's credit with the Category's.

## Decision

1. **Readers derive.** One helper decides whether an entry is Credit Time:
   - If the entry's Category is on this device, the Category's `isCredit` decides.
   - Otherwise, the stored `credit` flag decides. That covers a Category that hasn't synced yet.
   - An entry with no Category is Standard, as today.
   - LDC entries stay Credit Time, as today.

   Every total, breakdown, badge, widget and watch figure reads through this helper.

2. **Writers keep writing `credit`, set from the Category at save time.** Older builds, which total from the stored flag, keep working, and backup files keep the field.
3. **The extra mechanisms retire after older builds do.** Once ww-api's `minAppVersion` is at or above the first build that derives:
   - Flipping a Category's Credit stops restamping its entries.
   - `useTimeEntryCreditNormalization` is removed.

   Until then, both stay, because older builds still read the flag.

## Consequences

- A Category's credit setting has one source of truth for entries and Plans alike. Totals are right as soon as the Category changes, with no microtask window.
- After step 3:
  - A Credit flip changes one record (the Category) instead of every entry in it, so sync stops rewriting those entries.
  - The stored `credit` flag becomes a value kept for older builds, and nothing reads it while the Category is known.
- The widget, watch and report builders need the Categories passed in. Most already have them.
- If a device has never seen a Category (for example, a backup restored without Categories), its entries keep the stored flag, which is what they show today.
