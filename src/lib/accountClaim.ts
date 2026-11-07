import {
  type AccountFile,
  decideAccountAction,
  type AccountAction,
} from '@/lib/accountFile'

export type AccountClaim = {
  appUserId: string

  entitled: boolean

  claimedAt: number

  account?: string
}

const ACCOUNT_FINGERPRINT = /^[0-9a-f]{64}$/

const APP_USER_ID = /^[A-Za-z0-9_-]{8,64}$/

export const parseAccountClaim = (value: unknown): AccountClaim | null => {
  if (typeof value !== 'object' || value === null) return null
  const { appUserId, entitled, claimedAt, account } = value as Record<
    string,
    unknown
  >
  if (typeof appUserId !== 'string' || !APP_USER_ID.test(appUserId)) return null
  if (typeof entitled !== 'boolean') return null
  if (
    typeof claimedAt !== 'number' ||
    !Number.isSafeInteger(claimedAt) ||
    claimedAt < 0
  )
    return null

  if (account === undefined) return { appUserId, entitled, claimedAt }
  if (typeof account !== 'string' || !ACCOUNT_FINGERPRINT.test(account))
    return null
  return { appUserId, entitled, claimedAt, account }
}

export const accountFileClaim = (file: AccountFile): AccountClaim => ({
  appUserId: file.accountId,
  entitled: file.entitled,
  claimedAt: file.claimedAt ?? file.updatedAt,
  ...(file.account !== undefined ? { account: file.account } : {}),
})

export const pickWinningClaim = (
  claims: readonly AccountClaim[]
): AccountClaim | null => {
  const byId = new Map<string, AccountClaim>()
  for (const claim of claims) {
    const seen = byId.get(claim.appUserId)
    byId.set(
      claim.appUserId,
      seen
        ? {
            appUserId: claim.appUserId,
            entitled: seen.entitled || claim.entitled,
            claimedAt: Math.min(seen.claimedAt, claim.claimedAt),
            ...(seen.account !== undefined || claim.account !== undefined
              ? { account: seen.account ?? claim.account }
              : {}),
          }
        : claim
    )
  }
  let winner: AccountClaim | null = null
  for (const claim of byId.values()) {
    if (!winner || beats(claim, winner)) winner = claim
  }
  return winner
}

const beats = (a: AccountClaim, b: AccountClaim): boolean => {
  if (a.entitled !== b.entitled) return a.entitled
  if (a.claimedAt !== b.claimedAt) return a.claimedAt < b.claimedAt
  return a.appUserId < b.appUserId
}

export type DroppedAccountId = { appUserId: string; account: string }

export type AccountReconcileAction =
  | Exclude<AccountAction, { type: 'adopt' }>
  | { type: 'tag' }
  | {
      type: 'adopt'
      accountId: string
      claimedAt: number

      source: 'account_file' | 'sync'

      account: string | null

      tagged: boolean
    }

export const decideAccountReconcile = (input: {
  own: AccountClaim
  file: AccountFile | null
  fileRead: boolean
  peers: readonly AccountClaim[]
  account?: string | null
  dropped?: readonly DroppedAccountId[]
}): AccountReconcileAction => {
  const { own, file } = input
  const account = input.account ?? null
  const dropped = input.dropped ?? []
  const counts = (claim: AccountClaim) => {
    if (claim.account !== undefined)
      return account === null || claim.account === account
    return !dropped.some(
      (entry) =>
        entry.appUserId === claim.appUserId && entry.account !== account
    )
  }
  const fileClaim = input.fileRead && file ? accountFileClaim(file) : null
  const fileRead = input.fileRead && (!fileClaim || counts(fileClaim))
  const peers = input.peers.filter(counts)
  const winner =
    pickWinningClaim([
      own,
      ...(fileRead && fileClaim ? [fileClaim] : []),
      ...peers,
    ]) ?? own
  if (!own.entitled && winner.appUserId !== own.appUserId) {
    return {
      type: 'adopt',
      accountId: winner.appUserId,
      claimedAt: winner.claimedAt,
      source:
        fileRead && fileClaim?.appUserId === winner.appUserId
          ? 'account_file'
          : 'sync',
      account: account ?? winner.account ?? null,
      tagged: winner.account !== undefined,
    }
  }
  if (!fileRead) return { type: 'none' }
  const action = decideAccountAction({
    accountId: own.appUserId,
    entitled: own.entitled,
    file,
  })

  if (action.type === 'adopt') return { type: 'claim' }

  if (
    action.type === 'none' &&
    account !== null &&
    own.account === account &&
    file?.account === undefined &&
    file?.accountId === own.appUserId
  )
    return { type: 'tag' }
  return action
}
