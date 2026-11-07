import type { Online } from '@/lib/http/online'

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
