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
  }
  isBibleStudy: boolean
  notAtHome?: boolean
}
