export type AccountDataProtection = { on: boolean; at: number }

export type AccountDataProtectionState = {
  dataProtectionMode: boolean
  dataProtectionAccount: unknown
  dataProtectionAccountAnswered: number | null
}

export type AccountDataProtectionChange =
  | { kind: 'none' }
  | { kind: 'settle'; at: number }
  | { kind: 'ask'; on: boolean; at: number }

export function readAccountDataProtection(
  value: unknown
): AccountDataProtection | null {
  if (!value || typeof value !== 'object') return null
  const { on, at } = value as Record<string, unknown>
  if (typeof on !== 'boolean') return null
  if (typeof at !== 'number' || !Number.isFinite(at)) return null
  return { on, at }
}

export function accountDataProtectionChange(
  state: AccountDataProtectionState
): AccountDataProtectionChange {
  const account = readAccountDataProtection(state.dataProtectionAccount)
  if (!account || account.at === state.dataProtectionAccountAnswered)
    return { kind: 'none' }
  if (account.on === state.dataProtectionMode)
    return { kind: 'settle', at: account.at }
  return { kind: 'ask', on: account.on, at: account.at }
}

export function chosenDataProtection(on: boolean, at: number) {
  return {
    dataProtectionMode: on,
    dataProtectionModeSetByUser: true,
    dataProtectionAccount: { on, at } satisfies AccountDataProtection,
    dataProtectionAccountAnswered: at,
  }
}

export function answeredDataProtection(
  state: AccountDataProtectionState,
  follow: boolean
) {
  const account = readAccountDataProtection(state.dataProtectionAccount)
  if (!account) return null
  return {
    dataProtectionAccountAnswered: account.at,
    ...(follow
      ? { dataProtectionMode: account.on, dataProtectionModeSetByUser: true }
      : {}),
  }
}

export const keepsAccountDetailsPrivate = (state: {
  dataProtectionMode: boolean
  dataProtectionAccount: unknown
}) =>
  state.dataProtectionMode ||
  readAccountDataProtection(state.dataProtectionAccount)?.on === true
