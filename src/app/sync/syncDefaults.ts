/**
 * Who gets sync turned on without choosing (ADR 0040 §2, ADR 0030 §3). Sync is
 * free, so a new install gets the default whatever its Supporter status. An
 * install from before that (`installedBeforeFreeSync`) isn't switched: it keeps
 * the rule it had, where only a Supporter got sync without choosing, and is
 * offered Cloud Sync in the notifications tray instead.
 */
export type SyncDefaultInputs = {
  installedBeforeFreeSync: boolean
  isSupporter: boolean
  /** The server's `sync:entitlement`, as last read. */
  entitlement: 'supporter' | 'everyone' | undefined
  /** The account's own answer (`GET /accounts/v1/sync`), as last read. */
  cloudSyncEntitled: boolean | null
}

/**
 * Whether Cloud Sync's default (`CloudSyncDefault`) may turn on here, so it's
 * worth opening a session to ask. The server's answer still decides.
 */
export function cloudSyncDefaultMayApply({
  installedBeforeFreeSync,
  isSupporter,
  entitlement,
  cloudSyncEntitled,
}: SyncDefaultInputs): boolean {
  if (isSupporter) return true
  // Entitled while Cloud Sync was still for Supporters: the server knows a
  // Supporter this device doesn't yet.
  if (entitlement === 'supporter' && cloudSyncEntitled === true) return true
  return !installedBeforeFreeSync && entitlement === 'everyone'
}

/** Whether iCloud's or Drive's default turns on while Cloud Sync isn't offered. */
export const platformSyncDefaultApplies = ({
  installedBeforeFreeSync,
  isSupporter,
}: Pick<SyncDefaultInputs, 'installedBeforeFreeSync' | 'isSupporter'>) =>
  !installedBeforeFreeSync || isSupporter
