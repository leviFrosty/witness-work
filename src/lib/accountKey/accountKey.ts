import { fromB64u, sameBytes, toB64u } from '@/lib/bytes'
import {
  AccountSessionError,
  type RekeyedTokens,
} from '@/lib/serverAccount/session'

export type { RekeyedTokens }

export type AccountKeyStore = {
  peek: () => Promise<string | null>
  getOrCreate: () => Promise<string>
  replace: (key: string) => Promise<void>
}

export type AccountKeyLoss = {
  buddies: number

  buddyNames: string[]

  inboxRegistered: boolean

  keptElsewhere: boolean
}

export const NO_LOSS: AccountKeyLoss = {
  buddies: 0,
  buddyNames: [],
  inboxRegistered: false,
  keptElsewhere: false,
}

export const losesSomething = (loss: AccountKeyLoss) =>
  loss.buddies > 0 || loss.inboxRegistered

export type AccountKeyServiceDeps = {
  store: AccountKeyStore

  account: {
    ensure: (
      accountKey: Uint8Array,
      call?: { accountId?: string }
    ) => Promise<{ accountId: string } | null>
    changeKey: (
      swap: () => Promise<void>,
      keys: { from: Uint8Array | null; to: Uint8Array }
    ) => Promise<void>

    signedInElsewhere: () => Promise<boolean>

    lastAccountId?: () => string | null

    rekeyed?: (
      from: Uint8Array,
      to: Uint8Array,
      call: { accountId: string; tokens?: RekeyedTokens }
    ) => Promise<void>

    openDetached?: (
      accountKey: Uint8Array,
      call: { accountId?: string }
    ) => Promise<SameAccountSession>
  }

  buddies: {
    loss: () => Omit<AccountKeyLoss, 'keptElsewhere'>
    release: (scope: 'device' | 'account') => Promise<void>
    forget: () => void
  }

  sync?: { leave: () => Promise<void> }

  keyChangeUnfinished?: () => Promise<boolean>
}

export type OpenedAccountSession = { adopt: () => Promise<void> }

export type SameAccountSession = OpenedAccountSession & {
  accountId: string
  close: () => Promise<void>
}

export type ReplaceAccountKeyResult =
  | { outcome: 'unchanged' }
  | {
      outcome: 'replaced'
      loss: AccountKeyLoss

      accountId: string | null

      sameAccount: boolean
    }

export class AccountKeyLossError extends Error {
  constructor(readonly loss: AccountKeyLoss) {
    super('Replacing the account key would delete Buddies data')
    this.name = 'AccountKeyLossError'
  }
}

export class KeyChangeUnfinishedError extends Error {
  constructor() {
    super('A key change on this device is not finished')
    this.name = 'KeyChangeUnfinishedError'
  }
}

export class AccountKeyRetiredError extends Error {
  constructor(readonly changedAt: number | null) {
    super('The account key was retired by a key change')
    this.name = 'AccountKeyRetiredError'
  }
}

const retiredOr = (error: unknown) =>
  error instanceof AccountSessionError && error.failure === 'keyRetired'
    ? new AccountKeyRetiredError(error.changedAt)
    : error

const KEY_BYTES = 32

export function createAccountKeyService(deps: AccountKeyServiceDeps) {
  let replacing: Promise<ReplaceAccountKeyResult> | null = null

  async function peek(): Promise<Uint8Array | null> {
    const key = await deps.store.peek()
    return key ? fromB64u(key) : null
  }

  async function getOrCreate(): Promise<Uint8Array> {
    return fromB64u(await deps.store.getOrCreate())
  }

  const isSameAccount = (accountId: string | undefined) =>
    accountId !== undefined &&
    accountId === (deps.account.lastAccountId?.() ?? null)

  async function lossIfReplaced(
    newKey?: Uint8Array,
    { accountId }: { accountId?: string } = {}
  ): Promise<AccountKeyLoss> {
    if (isSameAccount(accountId)) return NO_LOSS
    const current = await peek()
    if (!current || (newKey && sameBytes(current, newKey))) return NO_LOSS
    return currentLoss()
  }

  async function currentLoss(): Promise<AccountKeyLoss> {
    const loss = { ...deps.buddies.loss(), keptElsewhere: false }
    if (!losesSomething(loss)) return loss
    return { ...loss, keptElsewhere: await deps.account.signedInElsewhere() }
  }

  async function rejoin(
    current: Uint8Array | null,
    newKey: Uint8Array,
    accountId: string,
    session: OpenedAccountSession | undefined
  ): Promise<ReplaceAccountKeyResult> {
    await deps.account.changeKey(
      async () => {
        await deps.store.replace(toB64u(newKey))
        deps.buddies.forget()
        await session?.adopt()
      },
      { from: current, to: newKey }
    )
    const account = await deps.account
      .ensure(newKey, { accountId })
      .catch(() => null)
    return {
      outcome: 'replaced',
      loss: NO_LOSS,
      accountId: account?.accountId ?? null,
      sameAccount: true,
    }
  }

  async function run(
    newKey: Uint8Array,
    confirmedLoss: boolean,
    session: OpenedAccountSession | undefined,
    accountId: string | undefined
  ): Promise<ReplaceAccountKeyResult> {
    const current = await peek()
    if (current && sameBytes(current, newKey)) return { outcome: 'unchanged' }
    if (await deps.keyChangeUnfinished?.()) throw new KeyChangeUnfinishedError()
    if (isSameAccount(accountId))
      return rejoin(current, newKey, accountId!, session)

    const loss = current ? await currentLoss() : NO_LOSS
    if (losesSomething(loss)) {
      if (!confirmedLoss) throw new AccountKeyLossError(loss)

      await deps.buddies.release(loss.keptElsewhere ? 'device' : 'account')
    }

    if (current) await deps.sync?.leave().catch(() => undefined)

    await deps.account.changeKey(
      async () => {
        await deps.store.replace(toB64u(newKey))
        deps.buddies.forget()
        await session?.adopt()
      },
      { from: current, to: newKey }
    )
    const account = await deps.account.ensure(newKey).catch(() => null)
    return {
      outcome: 'replaced',
      loss,
      accountId: account?.accountId ?? null,
      sameAccount: false,
    }
  }

  function replace(
    newKey: Uint8Array,
    {
      confirmedLoss = false,
      session,
      accountId,
    }: {
      confirmedLoss?: boolean
      session?: OpenedAccountSession
      accountId?: string
    } = {}
  ): Promise<ReplaceAccountKeyResult> {
    if (newKey.length !== KEY_BYTES)
      return Promise.reject(new Error('Account key must be 32 bytes'))
    const previous = replacing ?? Promise.resolve()
    const next = previous
      .catch(() => undefined)
      .then(() => run(newKey, confirmedLoss, session, accountId))
    replacing = next
    void next
      .catch(() => undefined)
      .finally(() => {
        if (replacing === next) replacing = null
      })
    return next
  }

  async function sameAccountSession(
    newKey: Uint8Array
  ): Promise<SameAccountSession | null> {
    const accountId = deps.account.lastAccountId?.() ?? null
    if (!accountId || !deps.account.openDetached) return null
    try {
      return await deps.account.openDetached(newKey, { accountId })
    } catch (error) {
      if (
        (error as { serverCode?: unknown } | null)?.serverCode ===
          'unknown_account' ||
        (error instanceof AccountSessionError &&
          error.failure === 'unavailable')
      )
        return null
      throw retiredOr(error)
    }
  }

  async function openSession(newKey: Uint8Array): Promise<SameAccountSession> {
    if (!deps.account.openDetached)
      throw new Error('Sessions need openDetached')
    try {
      return await deps.account.openDetached(newKey, {})
    } catch (error) {
      throw retiredOr(error)
    }
  }

  const keyChangeUnfinished = async () =>
    (await deps.keyChangeUnfinished?.()) ?? false

  async function adoptChangedKey(
    oldKey: Uint8Array,
    newKey: Uint8Array,
    call: { accountId: string; tokens?: RekeyedTokens }
  ): Promise<void> {
    if (newKey.length !== KEY_BYTES)
      throw new Error('Account key must be 32 bytes')
    if (!deps.account.rekeyed) throw new Error('Key changes need rekeyed')
    await deps.account.rekeyed(oldKey, newKey, call)

    await deps.store.replace(toB64u(newKey))
    deps.buddies.forget()
  }

  return {
    peek,
    getOrCreate,
    lossIfReplaced,
    replace,
    adoptChangedKey,
    sameAccountSession,
    openSession,
    keyChangeUnfinished,
  }
}

export type AccountKeyService = ReturnType<typeof createAccountKeyService>
