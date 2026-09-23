export type Notification = {
  date: Date
  id: string
}

/**
 * Tombstone written when a record is deleted so the deletion propagates across
 * devices.
 */
export type VisitTombstone = {
  id: string
  deletedAt: number
}

/**
 * A single field-ministry interaction with a Contact on a given date. May
 * result in a real conversation (someone home, talked) or a not-at-home outcome
 * (no one answered). Carries an optional note, an optional follow-up, and a
 * Bible Study flag for the user to indicate this Visit conducted a Bible
 * study.
 *
 * Renamed from `Conversation` — the legacy name understated the type's actual
 * scope (not every Visit is a conversation; see `notAtHome`).
 */
export type Visit = {
  id: string
  /**
   * Epoch ms of the most recent change. Used by iCloud sync's per-record
   * last-writer-wins merge. Optional for historical records predating sync
   * (backfilled on first sync boot).
   */
  updatedAt?: number
  contact: {
    id: string
  }
  date: Date
  note?: string
  /**
   * Present only when the user turned on the Follow Up switch in the visit
   * form. Absence means "no return visit planned" — history hides the section
   * and nothing surfaces in Missed/Approaching Conversations or the widget.
   * Legacy placeholder follow-ups (no reminder, no topic) are stripped by the
   * conversation store's persist migration and the sync payload parser.
   */
  followUp?: {
    /**
     * User intent, synced with the Visit; native calendar identifiers stay
     * local.
     */
    calendarIncluded?: boolean
    calendarDurationMinutes?: number
    date: Date
    notifyMe: boolean
    topic?: string
    /**
     * TODO: Refactor where there is only one notification enabled. Also
     * simplifies VisitFormScreen submit function.
     */
    notifications?: Notification[] // Changing to only one
    /**
     * When true, the user has dismissed this follow-up — it should be hidden
     * from "Missed Conversations" and the widget's overdue list, but the
     * follow-up's `topic` and any other data are preserved (non-destructive).
     * Re-enabled by rescheduling, which clears this flag implicitly.
     */
    dismissed?: boolean
  }
  isBibleStudy: boolean
  notAtHome?: boolean
}
