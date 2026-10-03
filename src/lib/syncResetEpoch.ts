/**
 * A reset generation of the iCloud data. "Keep this device's data" and "Rebuild
 * iCloud data" start a new one; payloads from an older one are pre-reset
 * snapshots. Payloads without one are generation zero. See
 * docs/icloud-sync.md.
 */
export type ResetEpoch = {
  id: string
  /** `syncNow()` when the reset started; compared before `id`. */
  at: number
  deviceId: string
  /** Shown to devices that adopt it. */
  deviceName?: string
}

/** Orders by `at`, then `id`. Generation zero sorts below every epoch. */
export function compareResetEpochs(
  a: ResetEpoch | null | undefined,
  b: ResetEpoch | null | undefined
): number {
  if (!a || !b) return (a ? 1 : 0) - (b ? 1 : 0)
  if (a.at !== b.at) return a.at < b.at ? -1 : 1
  return a.id === b.id ? 0 : a.id < b.id ? -1 : 1
}

export function newestResetEpoch(
  epochs: (ResetEpoch | null | undefined)[]
): ResetEpoch | null {
  let newest: ResetEpoch | null = null
  for (const epoch of epochs)
    if (compareResetEpochs(epoch, newest) > 0) newest = epoch!
  return newest
}

/** Only the payloads of the newest generation describe the current data. */
export function atNewestResetEpoch<T extends { resetEpoch?: ResetEpoch }>(
  payloads: T[]
): T[] {
  const newest = newestResetEpoch(payloads.map((p) => p.resetEpoch))
  return payloads.filter((p) => compareResetEpochs(p.resetEpoch, newest) === 0)
}

/**
 * A new epoch, later than `previous` even if this device's clock went back. Not
 * security-sensitive; the id only breaks ties.
 */
export function createResetEpoch(args: {
  now: number
  previous: ResetEpoch | null
  deviceId: string
  deviceName?: string
}): ResetEpoch {
  return {
    id:
      Math.random().toString(36).slice(2, 10) +
      Math.random().toString(36).slice(2, 10),
    at: Math.max(Math.floor(args.now), (args.previous?.at ?? 0) + 1),
    deviceId: args.deviceId,
    ...(args.deviceName ? { deviceName: args.deviceName } : {}),
  }
}
