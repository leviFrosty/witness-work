export type Notification = {
  date: Date
  id: string
}

/**
 * Tombstone written when a record is deleted so the deletion propagates across
 * devices.
 */
export type ConversationTombstone = {
  id: string
  deletedAt: number
}

export type Conversation = {
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
  followUp?: {
    date: Date
    notifyMe: boolean
    topic?: string
    /**
     * TODO: Refactor where there is only one notification enabled. Also
     * simplifies ConversationForm.tsx submit function.
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
