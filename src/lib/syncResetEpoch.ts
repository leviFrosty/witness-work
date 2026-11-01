export type ResetEpoch = {
  id: string

  at: number
  deviceId: string

  deviceName?: string
}

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

export function atNewestResetEpoch<T extends { resetEpoch?: ResetEpoch }>(
  payloads: T[]
): T[] {
  const newest = newestResetEpoch(payloads.map((p) => p.resetEpoch))
  return payloads.filter((p) => compareResetEpochs(p.resetEpoch, newest) === 0)
}

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
