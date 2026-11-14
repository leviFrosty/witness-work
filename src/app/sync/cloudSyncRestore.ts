import { usePreferences } from '@/stores/preferences'
import { hasAccountKey } from '@/lib/serverAccount'
import { isKnownOffline } from '@/lib/http/online'
import { cloudSyncOnly, hasSyncEngine } from '@/lib/syncTransport/platform'
import { cloudSyncOffered, usesCloudSync } from '@/lib/syncTransport/provider'
import { prepareCloudSync } from '@/app/sync/cloudSync'
import { iCloudSync, type RemotePeek } from '@/app/sync/iCloudSync'
import type { SyncPayload } from '@/app/sync/payload'

export const cloudSyncRestoreOffered = (): boolean =>
  hasSyncEngine() && !cloudSyncOnly() && cloudSyncOffered()

export async function peekCloudSyncRestore(): Promise<RemotePeek> {
  if (!cloudSyncRestoreOffered()) return { status: 'unavailable' }
  if (!(await hasAccountKey())) return { status: 'unavailable' }
  const prepared = await prepareCloudSync()
  if (prepared.outcome !== 'ready')
    return prepared.outcome === 'no_session' && isKnownOffline()
      ? { status: 'offline' }
      : { status: 'unavailable' }
  if (!usesCloudSync()) return { status: 'unavailable' }
  return iCloudSync.peekRemotePayload()
}

export type CloudSyncLookup = RemotePeek | { status: 'no_account' }

export const freshInstall = (): boolean => {
  const prefs = usePreferences.getState()
  return (
    !prefs.onboardingComplete &&
    !prefs.iCloudSyncEnabled &&
    !prefs.iCloudSyncSetByUser &&
    prefs.syncProvider === null &&
    !iCloudSync.hasMeaningfulLocalData()
  )
}

let lookup: Promise<CloudSyncLookup> | null = null
let settled: CloudSyncLookup | null = null
let autoClaimed = false

export function resetCloudSyncRestoreForTests() {
  lookup = null
  settled = null
  autoClaimed = false
}

const lookUp = async (): Promise<CloudSyncLookup> => {
  if (!(await hasAccountKey())) return { status: 'no_account' }
  return peekCloudSyncRestore()
}

const reusable = (result: CloudSyncLookup | null) =>
  result === null || result.status === 'found'

export function findCloudSyncRestore({
  fresh = false,
}: { fresh?: boolean } = {}): Promise<CloudSyncLookup> {
  if (fresh || !lookup || !reusable(settled)) {
    settled = null
    const current: Promise<CloudSyncLookup> = lookUp().catch(() => ({
      status: 'unavailable',
    }))
    lookup = current
    void current.then((result) => {
      if (lookup === current) settled = result
    })
  }
  return lookup
}

export function prefetchCloudSyncRestore(): void {
  if (!cloudSyncRestoreOffered() || !freshInstall()) return
  void findCloudSyncRestore()
}

export const cloudSyncRestoreWaiting = (): boolean =>
  settled?.status === 'found' && !autoClaimed && freshInstall()

export function declineCloudSyncRestore(): void {
  autoClaimed = true
}

export function claimAutoRestore(): boolean {
  if (autoClaimed) return false
  autoClaimed = true
  return true
}

export function restoreFromCloudSync(remote: SyncPayload): boolean {
  if (!freshInstall() || !usesCloudSync()) return false
  usePreferences.setState({ syncProvider: 'cloud' })
  iCloudSync.applyPullEnable(remote, 'onboarding_restore')
  lookup = null
  settled = null
  return true
}
