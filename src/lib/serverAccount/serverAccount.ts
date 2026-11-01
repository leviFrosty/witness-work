import { getOnline } from '@/lib/http/online'
import { HttpError } from '@/lib/http/request'
import type {
  AccountStatus,
  ServerAccountInfo,
} from '@/lib/serverAccount/client'
import {
  type AccountSigningKey,
  deriveAccountSigningKey,
  signInboxLink,
} from '@/lib/serverAccount/keys'
import {
  AccountSessionError,
  type AccountSessionInfo,
  type AttestationProblem,
  toAccountSessionError,
} from '@/lib/serverAccount/session'

export type CachedServerAccount = {
  accountPub: string
  accountId: string | null

  status?: AccountStatus

  unavailableUntil?: number
}

export type ServerAccountStorage = {
  get: () => CachedServerAccount | null
  set: (value: CachedServerAccount | null) => void
}

export type ServerAccountSession = {
  accountId: string

  signInboxLink: (inboxId: string, ownerPub: string) => string
}

export type ServerAccountDeps = {
  sessions: {
    ensure: (
      accountKey: Uint8Array,
      call?: { retry?: boolean }
    ) => Promise<AccountSessionInfo>
    forget: () => void
    close: () => Promise<void>
    changeKey: <T>(
      swap: () => Promise<T>,
      keys?: { from?: Uint8Array | null; to?: Uint8Array | null }
    ) => Promise<T>
    noteStatus?: (accountPub: string, status: AccountStatus) => void
  }

  info?: (accountKey: Uint8Array) => Promise<ServerAccountInfo>
  storage: ServerAccountStorage
  now: () => number

  onKeyChanged?: () => void
}

export type ServerAccountCheck =
  | { state: AccountStatus; accountId: string }
  | { state: 'unavailable'; accountId: null }
  | {
      state: 'unverified'
      problem: AttestationProblem
      accountId: string | null
    }
  | { state: 'updateRequired'; accountId: string | null }
  | {
      state: 'offline' | 'unreachable'
      accountId: string | null
      lastStatus: AccountStatus | null
    }

export const ACCOUNTS_UNAVAILABLE_RETRY_MS = 24 * 60 * 60 * 1000

const isDisabled = (error: unknown) =>
  error instanceof HttpError && error.serverCode === 'disabled'

export function createServerAccount(deps: ServerAccountDeps) {
  const session = (
    key: AccountSigningKey,
    accountId: string
  ): ServerAccountSession => ({
    accountId,
    signInboxLink: (inboxId, ownerPub) =>
      signInboxLink(key, accountId, inboxId, ownerPub),
  })

  const remember = (
    key: AccountSigningKey,
    account: { accountId: string; status: AccountStatus }
  ) =>
    deps.storage.set({
      accountPub: key.publicKey,
      accountId: account.accountId,
      status: account.status,
    })

  const markUnavailable = (key: AccountSigningKey) =>
    deps.storage.set({
      accountPub: key.publicKey,
      accountId: null,
      unavailableUntil: deps.now() + ACCOUNTS_UNAVAILABLE_RETRY_MS,
    })

  function cached(accountKey: Uint8Array): CachedServerAccount | null {
    const cachedAccount = deps.storage.get()
    return cachedAccount?.accountPub ===
      deriveAccountSigningKey(accountKey).publicKey
      ? cachedAccount
      : null
  }

  async function connect(
    accountKey: Uint8Array,
    call: { retry?: boolean } = {}
  ): Promise<ServerAccountSession> {
    const key = deriveAccountSigningKey(accountKey)
    const known = cached(accountKey)
    if (
      !call.retry &&
      known &&
      !known.accountId &&
      (known.unavailableUntil ?? 0) > deps.now()
    )
      throw new AccountSessionError('unavailable', {
        serverCode: 'disabled',
      })
    try {
      const opened = await deps.sessions.ensure(accountKey, call)
      if (
        known?.accountId !== opened.accountId ||
        known.status !== opened.status
      )
        remember(key, opened)
      return session(key, opened.accountId)
    } catch (error) {
      if (isDisabled(error)) markUnavailable(key)
      throw toAccountSessionError(error)
    }
  }

  async function ensure(
    accountKey: Uint8Array
  ): Promise<ServerAccountSession | null> {
    try {
      return await connect(accountKey)
    } catch {
      return null
    }
  }

  function noteStatus(accountPub: string, status: AccountStatus) {
    const known = deps.storage.get()
    if (
      known?.accountPub !== accountPub ||
      !known.accountId ||
      known.status === status
    )
      return
    deps.storage.set({ ...known, status })
  }

  function forget() {
    deps.storage.set(null)
    deps.sessions.forget()
  }

  async function close(): Promise<void> {
    await deps.sessions.close().catch(() => undefined)
    deps.storage.set(null)
  }

  function changeKey<T>(
    swap: () => Promise<T>,
    keys?: { from?: Uint8Array | null; to?: Uint8Array | null }
  ): Promise<T> {
    return deps.sessions
      .changeKey(async () => {
        deps.storage.set(null)
        return swap()
      }, keys)
      .then((result) => {
        deps.onKeyChanged?.()
        return result
      })
  }

  function failedCheck(
    accountKey: Uint8Array,
    error: unknown
  ): ServerAccountCheck {
    const failure = toAccountSessionError(error)
    const known = cached(accountKey)
    if (failure.failure === 'unavailable')
      return { state: 'unavailable', accountId: null }
    if (failure.failure === 'attestation')
      return {
        state: 'unverified',
        problem: failure.attestation ?? 'failed',
        accountId: known?.accountId ?? null,
      }
    if (failure.failure === 'upgrade')
      return { state: 'updateRequired', accountId: known?.accountId ?? null }
    const noConnection =
      (failure.failure === 'offline' || failure.failure === 'cancelled') &&
      getOnline() !== true
    return {
      state: noConnection ? 'offline' : 'unreachable',
      accountId: known?.accountId ?? null,
      lastStatus: known?.status ?? null,
    }
  }

  async function check(
    accountKey: Uint8Array,
    call: { retry?: boolean } = {}
  ): Promise<ServerAccountCheck> {
    let account: ServerAccountSession
    try {
      account = await connect(accountKey, call)
    } catch (error) {
      return failedCheck(accountKey, error)
    }
    if (!deps.info) {
      const status = cached(accountKey)?.status ?? 'active'
      return { state: status, accountId: account.accountId }
    }
    const key = deriveAccountSigningKey(accountKey)
    try {
      const info = await deps.info(accountKey)
      remember(key, info)
      deps.sessions.noteStatus?.(key.publicKey, info.status)
      return { state: info.status, accountId: info.accountId }
    } catch (error) {
      if (isDisabled(error)) markUnavailable(key)
      return failedCheck(accountKey, error)
    }
  }

  return {
    connect,
    ensure,
    forget,
    close,
    changeKey,
    cached,
    check,
    noteStatus,
  }
}

export type ServerAccount = ReturnType<typeof createServerAccount>
