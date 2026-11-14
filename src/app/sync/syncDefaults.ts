export type SyncDefaultInputs = {
  installedBeforeFreeSync: boolean
  isSupporter: boolean

  entitlement: 'supporter' | 'everyone' | undefined

  cloudSyncEntitled: boolean | null
}

export function cloudSyncDefaultMayApply({
  installedBeforeFreeSync,
  isSupporter,
  entitlement,
  cloudSyncEntitled,
}: SyncDefaultInputs): boolean {
  if (installedBeforeFreeSync) return false
  if (isSupporter) return true
  if (entitlement === 'supporter') return cloudSyncEntitled === true
  return entitlement === 'everyone'
}

export const platformSyncDefaultApplies = ({
  installedBeforeFreeSync,
}: Pick<SyncDefaultInputs, 'installedBeforeFreeSync'>) =>
  !installedBeforeFreeSync
