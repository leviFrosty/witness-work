export interface AllowanceDeniedFields {
  objectId: string
  kind: 'import' | 'refinement'
  isSupporter: boolean
  used: number
  limit: number
  resetsAt: string | null
}

export const allowanceDeniedEvent = (fields: AllowanceDeniedFields) => ({
  event: 'notes_import_allowance_denied' as const,
  ...fields,
})

export interface WindowRolledOverFields {
  objectId: string
  isSupporter: boolean
  previousUsed: number
  previousLimit: number
  previousResetsAt: string
  newResetsAt: string
}

export const windowRolledOverEvent = (fields: WindowRolledOverFields) => ({
  event: 'notes_import_window_rolled_over' as const,
  ...fields,
})

export interface UsageResetFields {
  objectId: string
  previousUsed: number
  hadActiveWindow: boolean
  deletedEmptyRuns: number
}

export const usageResetEvent = (fields: UsageResetFields) => ({
  event: 'notes_import_usage_reset' as const,
  ...fields,
})

export type NotesImportOperationalEvent =
  | ReturnType<typeof allowanceDeniedEvent>
  | ReturnType<typeof windowRolledOverEvent>
  | ReturnType<typeof usageResetEvent>

/** Expected business event, intentionally emitted to Worker logs—not Sentry. */
export const emitNotesImportOperationalEvent = (
  event: NotesImportOperationalEvent
): void => console.log(event)
