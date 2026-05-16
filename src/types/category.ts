/**
 * Category — User-defined grouping of Time Entries (e.g. "Bethel", "Hospital",
 * "Morning territory"). Each Category carries whether it counts as Credit Time;
 * this is the single source of truth for credit attribution on a tagged entry.
 *
 * Replaces the legacy `tag: string` field on `TimeEntry` and the legacy
 * `preferences.serviceReportTags` user-list. ServiceReports now reference a
 * Category by id (`TimeEntry.categoryId`).
 *
 * Glossary: see CONTEXT.md → "Category".
 */
export type Category = {
  /** Stable UUID. The id is what gets referenced by `TimeEntry.categoryId`. */
  id: string
  /** User-visible label (e.g. "Bethel", "Hospital"). */
  name: string
  /**
   * Whether this Category counts as Credit Time toward the publisher's monthly
   * cap. Source of truth for credit attribution on every Time Entry that
   * references this category — the per-entry `credit` boolean is no longer
   * authoritative.
   */
  isCredit: boolean
  /**
   * App-seeded "builtin" Categories the User cannot rename or delete — LDC is
   * the canonical example (`LDC_BUILTIN_CATEGORY_ID`). Absent/false on every
   * user-created Category. UI surfaces (delete button, name edit) gate on this
   * flag; the categories store hard-blocks mutations against it as a defensive
   * fallback.
   */
  builtin?: boolean
  /**
   * Epoch ms of the most recent change. Used for iCloud last-writer-wins merge.
   * Optional for historical records that predate sync — backfilled lazily.
   */
  updatedAt?: number
}

/**
 * Tombstone written when a Category is deleted so the deletion propagates
 * across devices via iCloud sync. Mirrors `TimeEntryTombstone`.
 */
export type CategoryTombstone = {
  id: string
  deletedAt: number
}
