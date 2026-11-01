import { fromB64u, toB64u } from '@/lib/bytes'

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
    ensure: (accountKey: Uint8Array) => Promise<{ accountId: string } | null>
    changeKey: (
      swap: () => Promise<void>,
      keys: { from: Uint8Array | null; to: Uint8Array }
    ) => Promise<void>

    signedInElsewhere: () => Promise<boolean>
  }

  buddies: {
    loss: () => Omit<AccountKeyLoss, 'keptElsewhere'>
    release: (scope: 'device' | 'account') => Promise<void>
    forget: () => void
  }

  sync?: { leave: () => Promise<void> }
}

export type OpenedAccountSession = { adopt: () => Promise<void> }

export type ReplaceAccountKeyResult =
  | { outcome: 'unchanged' }
  | {
      outcome: 'replaced'
      loss: AccountKeyLoss

      accountId: string | null
    }

export class AccountKeyLossError extends Error {
  constructor(readonly loss: AccountKeyLoss) {
    super('Replacing the account key would delete Buddies data')
    this.name = 'AccountKeyLossError'
  }
}

const KEY_BYTES = 32

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, i) => byte === b[i])

export function createAccountKeyService(deps: AccountKeyServiceDeps) {
  let replacing: Promise<ReplaceAccountKeyResult> | null = null

  async function peek(): Promise<Uint8Array | null> {
    const key = await deps.store.peek()
    return key ? fromB64u(key) : null
  }

  async function getOrCreate(): Promise<Uint8Array> {
    return fromB64u(await deps.store.getOrCreate())
  }

  async function lossIfReplaced(newKey?: Uint8Array): Promise<AccountKeyLoss> {
    const current = await peek()
    if (!current || (newKey && sameBytes(current, newKey))) return NO_LOSS
    return currentLoss()
  }

  async function currentLoss(): Promise<AccountKeyLoss> {
    const loss = { ...deps.buddies.loss(), keptElsewhere: false }
    if (!losesSomething(loss)) return loss
    return { ...loss, keptElsewhere: await deps.account.signedInElsewhere() }
  }

  async function run(
    newKey: Uint8Array,
    confirmedLoss: boolean,
    session: OpenedAccountSession | undefined
  ): Promise<ReplaceAccountKeyResult> {
    const current = await peek()
    if (current && sameBytes(current, newKey)) return { outcome: 'unchanged' }

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
    return { outcome: 'replaced', loss, accountId: account?.accountId ?? null }
  }

  function replace(
    newKey: Uint8Array,
    {
      confirmedLoss = false,
      session,
    }: { confirmedLoss?: boolean; session?: OpenedAccountSession } = {}
  ): Promise<ReplaceAccountKeyResult> {
    if (newKey.length !== KEY_BYTES)
      return Promise.reject(new Error('Account key must be 32 bytes'))
    const previous = replacing ?? Promise.resolve()
    const next = previous
      .catch(() => undefined)
      .then(() => run(newKey, confirmedLoss, session))
    replacing = next
    void next
      .catch(() => undefined)
      .finally(() => {
        if (replacing === next) replacing = null
      })
    return next
  }

  return { peek, getOrCreate, lossIfReplaced, replace }
}

export type AccountKeyService = ReturnType<typeof createAccountKeyService>
