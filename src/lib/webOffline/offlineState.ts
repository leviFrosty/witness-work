import type { Online } from '@/lib/http/online'

/**
 * Whether the offline banner shows (ADR 0037 §6): the browser says it's
 * offline, or Cloud Sync's last read or write failed for the network's reason
 * (`navigator.onLine` is true behind a captive portal or a dead connection).
 * Back online clears the first at once; a successful sync clears the second.
 */
export function offlineBannerShows({
  online,
  syncIssue,
  syncErrorCode,
}: {
  online: Online
  syncIssue: string | null
  syncErrorCode: string | null
}): boolean {
  if (online === false) return true
  return syncIssue !== null && syncErrorCode === 'network'
}
