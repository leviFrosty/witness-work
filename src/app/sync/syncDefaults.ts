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
  if (isSupporter) return true

  if (entitlement === 'supporter' && cloudSyncEntitled === true) return true
  return !installedBeforeFreeSync && entitlement === 'everyone'
}

export const platformSyncDefaultApplies = ({
  installedBeforeFreeSync,
  isSupporter,
}: Pick<SyncDefaultInputs, 'installedBeforeFreeSync' | 'isSupporter'>) =>
  !installedBeforeFreeSync || isSupporter
