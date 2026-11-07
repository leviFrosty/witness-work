export type FirstSyncState = 'checking' | 'stalled' | 'released'

export type FirstSyncStallReason = 'paused' | 'unreadable'

let state: FirstSyncState = 'checking'
let stallReason: FirstSyncStallReason | null = null
const listeners = new Set<() => void>()
const retryHandlers = new Set<() => void>()

const set = (next: FirstSyncState, reason: FirstSyncStallReason | null) => {
  if (state === next && stallReason === reason) return
  state = next
  stallReason = reason
  for (const listener of [...listeners]) listener()
}

export const firstSyncState = (): FirstSyncState => state

export const firstSyncStallReason = (): FirstSyncStallReason | null =>
  stallReason

export function stallFirstSync(reason?: FirstSyncStallReason): void {
  if (state === 'released') return
  set('stalled', reason ?? null)
}

export function releaseFirstSync(): void {
  set('released', null)
}

export function retryFirstSync(): void {
  if (state === 'released') return
  set('checking', null)
  for (const handler of [...retryHandlers]) handler()
}

export function resetFirstSync(): void {
  set('checking', null)
}

export function stallReasonShown({
  recorded,
  cloudSyncConfigEnabled,
  syncIssue,
}: {
  recorded: FirstSyncStallReason | null
  cloudSyncConfigEnabled: boolean | undefined
  syncIssue: string | null
}): FirstSyncStallReason | null {
  if (recorded) return recorded
  if (cloudSyncConfigEnabled === false) return 'paused'
  if (syncIssue === 'newer-version' || syncIssue === 'invalid-file')
    return 'unreadable'
  return null
}

export const onFirstSyncChange = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const onFirstSyncRetry = (handler: () => void): (() => void) => {
  retryHandlers.add(handler)
  return () => {
    retryHandlers.delete(handler)
  }
}
