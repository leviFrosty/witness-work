import { sameBytes } from '@/lib/bytes'
import type { SignedRequest } from '@/lib/serverAccount/client'
import type { OpenedSession } from '@/lib/serverAccount/sessionClient'
import {
  type AccountSessions,
  type SessionEndReason,
  sessionEndWipes,
} from '@/lib/serverAccount/session'
import type { WebAccountKey } from '@/lib/accountKey/webAccountKey'
import type { SessionTabs, WebTabMessage } from '@/lib/serverAccount/webTabs'
import { SIGNED_OUT_DATA } from '@/lib/webStorage/boot'

export const WEB_TICKET_LIFETIME_MS = 2 * 60 * 1000

export const WEB_CLOSE_WAIT_MS = 2_000

export const WEB_SIGN_OUT_FLUSH_MS = 5_000

export type WebAccountState =
  | { status: 'loading' }
  | { status: 'signedIn'; accountId: string }
  | {
      status: 'signedOut'
      ended: SessionEndReason | null
      changedAt?: number | null
      keptData: boolean
    }

export class WebSignInError extends Error {
  constructor(
    readonly reason:
      | 'wrongAccount'
      | 'otherAccount'
      | 'storage'
      | 'signUpPending'
      | 'keyHeld',
    options?: { cause?: unknown }
  ) {
    super(`web sign-in: ${reason}`, options)
    this.name = 'WebSignInError'
  }
}

export type WebSignIn = {
  accountId: string
  sessionId: string

  reload: boolean
}

export type KeyRetiredPending = { accountPub: string; changedAt: number | null }

export type WebAccountDeps = {
  sessions: Pick<
    AccountSessions,
    'adopt' | 'close' | 'forget' | 'receive' | 'ready'
  > & {
    snapshot: () => { accountId: string } | null
  }
  accountKey: Pick<
    WebAccountKey,
    'load' | 'peek' | 'save' | 'seal' | 'forget' | 'retire'
  >
  tabs: Pick<SessionTabs, 'publish' | 'subscribe'>

  owner: {
    read: () => Promise<string | null>

    write: (accountId: string | null) => Promise<void>
  }

  signUpKeyHeld?: (
    accountKey: Uint8Array
  ) => Promise<'signUpPending' | 'keyHeld' | null>

  hasLocalData: () => boolean | Promise<boolean>

  open: (
    ticket: string,
    accountKey: Uint8Array,
    signed: {
      signed?: SignedRequest
      onSigned: (signed: SignedRequest) => void
    }
  ) => Promise<OpenedSession>

  closeOpened: (accessToken: string) => Promise<void>

  markWipePending: () => Promise<void>

  wipe: () => Promise<void>

  afterSignInWipe?: () => Promise<void>
  reload: () => void

  onEnded?: (
    reason: SessionEndReason,
    outcome: 'wiped' | 'signIn' | 'keyChanged',
    from: { fromTab: boolean }
  ) => void

  keyRetiredPending: {
    read: () => Promise<KeyRetiredPending | null>
    write: (value: KeyRetiredPending | null) => Promise<void>
  }

  onKeyRetired?: (accountPub: string, changedAt: number | null) => Promise<void>

  onSignedIn?: (accountKey: Uint8Array, accountId: string) => void
  now?: () => number

  closeWaitMs?: number

  flushWaitMs?: number
}

export function createWebAccount(deps: WebAccountDeps) {
  let state: WebAccountState = { status: 'loading' }
  const listeners = new Set<() => void>()
  let wiping: Promise<void> | null = null
  let started: Promise<WebAccountState> | null = null
  const now = deps.now ?? Date.now
  const closeWaitMs = deps.closeWaitMs ?? WEB_CLOSE_WAIT_MS
  const flushWaitMs = deps.flushWaitMs ?? WEB_SIGN_OUT_FLUSH_MS
  const signOutHooks = new Set<() => Promise<unknown>>()

  let lastOpen: {
    ticket: string
    accountKey: Uint8Array
    signed: SignedRequest
    until: number
  } | null = null

  const set = (next: WebAccountState) => {
    state = next
    for (const listener of listeners) listener()
  }

  function wipeAndReload(): Promise<void> {
    wiping ??= (async () => {
      deps.accountKey.forget()
      try {
        await deps.markWipePending().catch(() => undefined)
        deps.tabs.publish({ type: 'wiped' })
        await deps.wipe()
      } finally {
        deps.reload()
      }
    })()
    return wiping
  }

  const signedOut = async (
    ended: SessionEndReason | null,
    changedAt?: number | null
  ) =>
    set({
      status: 'signedOut',
      ended,
      ...(ended === 'key_changed' && { changedAt: changedAt ?? null }),
      keptData: ![null, SIGNED_OUT_DATA].includes(
        await deps.owner.read().catch(() => null)
      ),
    })

  async function decide(
    reason: SessionEndReason,
    ending: { accountPub: string; changedAt: number | null }
  ): Promise<void> {
    if (reason === 'key_changed') await deps.keyRetiredPending.write(ending)
    else if (sessionEndWipes(reason)) await deps.markWipePending()
  }

  async function forgetRetiredKey(
    pending: KeyRetiredPending,
    { atLaunch = false }: { atLaunch?: boolean } = {}
  ): Promise<'kept' | 'wipe' | 'stale'> {
    const clear = () =>
      deps.keyRetiredPending.write(null).catch(() => undefined)
    const owner = await deps.owner.read().catch(() => null)
    if (wiping || [null, SIGNED_OUT_DATA].includes(owner)) return 'wipe'
    if (
      !(await deps.accountKey.retire(pending.accountPub)) &&
      (await deps.accountKey.peek()) !== null
    )
      return 'stale'
    const handled = Promise.resolve(
      deps.onKeyRetired?.(pending.accountPub, pending.changedAt)
    )
    if (atLaunch) {
      void handled.then(clear, () => undefined)
      return 'kept'
    }

    await handled
    await clear()
    return wiping ? 'wipe' : 'kept'
  }

  async function keyChanged(): Promise<void> {
    const pending = await deps.keyRetiredPending.read()
    const outcome = pending ? await forgetRetiredKey(pending) : 'wipe'
    if (outcome !== 'kept') {
      if (wiping) return wiping
      deps.onEnded?.('key_changed', 'wiped', { fromTab: false })
      return wipeAndReload()
    }
    deps.tabs.publish({ type: 'keyRetired' })
    await signedOut('key_changed', pending?.changedAt)
    deps.onEnded?.('key_changed', 'keyChanged', { fromTab: false })
  }

  function ended(reason: SessionEndReason, { fromTab }: { fromTab: boolean }) {
    if (reason === 'key_changed') {
      if (fromTab) void signedOut(reason)
      else
        void keyChanged().catch(() => {
          if (wiping) return
          deps.onEnded?.('key_changed', 'wiped', { fromTab: false })
          return wipeAndReload()
        })
      return
    }
    if (sessionEndWipes(reason)) {
      deps.onEnded?.(reason, 'wiped', { fromTab })

      void wipeAndReload()
      return
    }
    deps.onEnded?.(reason, 'signIn', { fromTab })
    void signedOut(reason)
  }

  function receive(message: WebTabMessage) {
    switch (message.type) {
      case 'tokens':
      case 'ended':
        deps.sessions.receive(message)
        return
      case 'wiped':
        deps.accountKey.forget()
        deps.reload()
        return
      case 'signedIn':
        if (state.status !== 'signedIn' || deps.sessions.snapshot() === null)
          deps.reload()
        return
      case 'keyRetired':
        deps.accountKey.forget()
        deps.reload()
        return
      case 'rekeyed':
        deps.reload()
    }
  }

  async function othersData(accountId: string): Promise<boolean> {
    try {
      const owner = await deps.owner.read()
      if (owner !== null)
        return owner !== SIGNED_OUT_DATA && owner !== accountId
      return await deps.hasLocalData()
    } catch {
      return true
    }
  }

  async function keep(
    accountKey: Uint8Array,
    opened: OpenedSession,
    onStored?: () => Promise<void>,
    keepData = false
  ): Promise<WebSignIn> {
    lastOpen = null
    let held: 'signUpPending' | 'keyHeld' | null
    try {
      held = (await deps.signUpKeyHeld?.(accountKey)) ?? null
    } catch (error) {
      void deps.closeOpened(opened.accessToken).catch(() => undefined)
      throw new WebSignInError('storage', { cause: error })
    }
    if (held) {
      void deps.closeOpened(opened.accessToken).catch(() => undefined)
      throw new WebSignInError(held)
    }
    const switching = await othersData(opened.accountId)
    if (keepData && switching) {
      void deps.closeOpened(opened.accessToken).catch(() => undefined)
      throw new WebSignInError('otherAccount')
    }

    const replacing =
      !switching && deps.sessions.snapshot()?.accountId === opened.accountId
    let wiped = false

    let before: { owner: string | null } | null = null
    try {
      if (switching) {
        await deps.sessions.close({ waitMs: closeWaitMs })
        deps.accountKey.forget()
        await deps.markWipePending()
        await deps.wipe()
        wiped = true
        await deps.afterSignInWipe?.()
      }

      const owner = wiped ? null : await deps.owner.read()
      await deps.owner.write(opened.accountId)
      before = { owner }

      if (switching) await deps.accountKey.seal(accountKey)
      else await deps.accountKey.save(accountKey)
      const adopted = await deps.sessions.adopt(
        accountKey,
        opened,
        replacing ? { replace: { waitMs: closeWaitMs } } : undefined
      )
      if (adopted === 'failed')
        throw new Error('The session could not be saved')

      await deps.keyRetiredPending.write(null).catch(() => undefined)
    } catch (error) {
      void deps.closeOpened(opened.accessToken).catch(() => undefined)

      if (before) await deps.owner.write(before.owner).catch(() => undefined)
      if (wiped) {
        deps.tabs.publish({ type: 'wiped' })
        deps.reload()
      }
      throw new WebSignInError('storage', { cause: error })
    }
    if (onStored) {
      let timer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        onStored().catch(() => undefined),
        new Promise((resolve) => (timer = setTimeout(resolve, closeWaitMs))),
      ])
      clearTimeout(timer)
    }
    const signedIn = {
      accountId: opened.accountId,
      sessionId: opened.sessionId,
      reload: switching,
    }
    if (switching) {
      set({ status: 'loading' })
      deps.tabs.publish({ type: 'wiped' })
      deps.reload()
      return signedIn
    }
    deps.tabs.publish({ type: 'signedIn', sessionId: opened.sessionId })
    set({ status: 'signedIn', accountId: opened.accountId })
    deps.onSignedIn?.(accountKey, opened.accountId)
    return signedIn
  }

  return {
    async start(): Promise<WebAccountState> {
      if (started) return started
      started = (async () => {
        deps.tabs.subscribe(receive)
        await deps.accountKey.load()
        await deps.sessions.ready()

        let pending: KeyRetiredPending | null
        try {
          pending = await deps.keyRetiredPending.read()
        } catch {
          await signedOut(null)
          return state
        }
        if (pending) {
          const outcome = await forgetRetiredKey(pending, {
            atLaunch: true,
          }).catch(() => 'wipe' as const)
          if (outcome === 'wipe') {
            if (!wiping)
              deps.onEnded?.('key_changed', 'wiped', { fromTab: false })
            void wipeAndReload()
            return state
          }
          if (outcome === 'stale')
            await deps.keyRetiredPending.write(null).catch(() => undefined)
          if (outcome === 'kept') {
            deps.sessions.forget()
            await signedOut('key_changed', pending.changedAt)
            return state
          }
        }
        const session = deps.sessions.snapshot()
        if (session && (await deps.accountKey.peek()))
          set({ status: 'signedIn', accountId: session.accountId })
        else await signedOut(null)
        return state
      })()
      return started
    },

    async openWebSessionWithTicket(
      ticket: string,
      accountKey: Uint8Array,
      {
        expectAccountId,
        onStored,
        keepData = false,
      }: {
        expectAccountId?: string
        onStored?: () => Promise<void>
        keepData?: boolean
      } = {}
    ): Promise<WebSignIn> {
      const retry =
        lastOpen?.ticket === ticket &&
        sameBytes(lastOpen.accountKey, accountKey) &&
        now() < lastOpen.until
          ? lastOpen.signed
          : undefined
      const opened = await deps.open(ticket, accountKey, {
        signed: retry,
        onSigned: (signed) => {
          lastOpen = {
            ticket,
            accountKey: new Uint8Array(accountKey),
            signed,
            until: now() + WEB_TICKET_LIFETIME_MS,
          }
        },
      })
      lastOpen = null
      if (expectAccountId && opened.accountId !== expectAccountId) {
        void deps.closeOpened(opened.accessToken).catch(() => undefined)
        throw new WebSignInError('wrongAccount')
      }
      return keep(accountKey, opened, onStored, keepData)
    },

    adoptSignupSession: (
      accountKey: Uint8Array,
      opened: OpenedSession
    ): Promise<WebSignIn> => keep(accountKey, opened),

    async signOut(): Promise<void> {
      await deps.markWipePending().catch(() => undefined)
      let timer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        Promise.allSettled([...signOutHooks].map((hook) => hook())),
        new Promise((resolve) => (timer = setTimeout(resolve, flushWaitMs))),
      ])
      clearTimeout(timer)
      await deps.sessions.close({ waitMs: closeWaitMs })
      await wipeAndReload()
    },
    decide,

    beforeSignOut(hook: () => Promise<unknown>): () => void {
      signOutHooks.add(hook)
      return () => {
        signOutHooks.delete(hook)
      }
    },
    ended,

    rekeyed(): void {
      deps.tabs.publish({ type: 'rekeyed' })
    },
    state: (): WebAccountState => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type WebAccount = ReturnType<typeof createWebAccount>
