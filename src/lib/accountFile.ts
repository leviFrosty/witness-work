export const ACCOUNT_FILENAME = 'witness-work-account.json'

export const isAccountFilename = (filename: string): boolean =>
  filename.startsWith('witness-work-account')

export type AccountFile = {
  v: 1

  accountId: string

  entitled: boolean
  updatedAt: number
  deviceName?: string
}

export const parseAccountFile = (json: string): AccountFile | null => {
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return null
    const candidate = parsed as Record<string, unknown>
    if (candidate.v !== 1) return null
    if (typeof candidate.accountId !== 'string' || !candidate.accountId) {
      return null
    }
    if (typeof candidate.entitled !== 'boolean') return null
    if (typeof candidate.updatedAt !== 'number') return null
    return candidate as AccountFile
  } catch {
    return null
  }
}

export type AccountAction =
  | { type: 'claim' }
  | { type: 'adopt'; accountId: string }
  | { type: 'refresh' }
  | { type: 'none' }

export const decideAccountAction = (input: {
  accountId: string

  entitled: boolean
  file: AccountFile | null
}): AccountAction => {
  const { accountId, entitled, file } = input
  if (!file) return { type: 'claim' }
  if (file.accountId === accountId) {
    if (file.entitled !== entitled) return { type: 'refresh' }
    return { type: 'none' }
  }
  if (!entitled) return { type: 'adopt', accountId: file.accountId }
  if (!file.entitled) return { type: 'claim' }
  return { type: 'none' }
}
