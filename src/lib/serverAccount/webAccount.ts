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

/**
 * A browser's account (docs/passkeys-protocol.md, "The app" → "On the web"; ADR
 * 0038 §8): signing in with a ticket, adopting web sign-up's session, signing
 * out, and what happens when the server ends the session. The account key and
 * the session are sealed in IndexedDB; the sign-in and sign-up screens call
 * this.
 *
 * - **Signing in** opens the web session with the ticket a passkey, a phone or a
 *   recovery key gave, then stores the key and the session. The local data
 *   picks up where it was only when it's the same account's: `owner` records
 *   whose it is when a session is kept, and anything else (another account, or
 *   data nobody owns) is wiped first. Whether the old key can be read never
 *   decides it.
 * - **The same account again** (Sign In Again, while signed in) keeps the data:
 *   the new session is stored first, then the one it replaces is closed. When
 *   it can't be stored, the old one stays.
 * - **Sign In Again never switches** (`keepData`): another account's session is
 *   closed, and nothing is wiped.
 * - **Another account** closes the old session, wipes, stores the new key and
 *   session without loading the key into this page, and reloads every tab
 *   (`reload` is then true), so nothing acts on the new key while the old
 *   account's data is in memory. The page that loads is signed in.
 * - **Signing out** first lets what's waiting go out (`beforeSignOut`: Cloud
 *   Sync's last push, waiting at most `WEB_SIGN_OUT_FLUSH_MS`), closes the
 *   session (waiting at most `WEB_CLOSE_WAIT_MS`), then wipes the account key,
 *   the session, and every local store, and reloads every tab. It never deletes
 *   this browser's Cloud Sync slot: it may be the only copy of the account's
 *   data and RevenueCat id.
 * - **Signed out by the server:** a refresh refused as `revoked` or `reused`
 *   wipes at once, like signing out, in every tab that hears of it. `expired`,
 *   `replaced` (and any other reason) keep the sealed key and the stores and
 *   show the sign-in screen.
 * - **The key changed on another device** (ADR 0039) while this session was live:
 *   the refresh is refused as `key_changed` (only the server labels a session
 *   so). The tab it was refused to notes the retired key before the session is
 *   cleared (`decide`), forgets only that key, keeps the stores, shows how to
 *   sign back in, and tells the other tabs, which reload. A launch finishes
 *   what a closed tab started, and a wipe wins. A browser signed out before the
 *   change reads `revoked`, and wipes. Signing in again as the same account,
 *   with its new key, picks up where it was (`owner`).
 *
 * A wipe is marked pending (`markWipePending`) before any tab hears of it, so
 * the next launch finishes one every tab closed in the middle of.
 */

/** How long a sign-in ticket lasts (docs/passkeys-protocol.md). */
export const WEB_TICKET_LIFETIME_MS = 2 * 60 * 1000

/**
 * How long signing out, or another account signing in, waits for the server to
 * close the session before wiping: offline, the server ends it in time.
 */
export const WEB_CLOSE_WAIT_MS = 2_000

/**
 * How long signing out waits for what it runs first (`beforeSignOut`): Cloud
 * Sync sending a change still waiting to go.
 */
export const WEB_SIGN_OUT_FLUSH_MS = 5_000

export type WebAccountState =
  /** Not known until `start` read what's stored, or reloading. */
  | { status: 'loading' }
  | { status: 'signedIn'; accountId: string }
  /**
   * The sign-in screen. `ended` says why the session ended, when the server
   * ended it; `keptData` when this browser still holds an account's data, which
   * signing in as that account picks up. With `ended: 'key_changed'`,
   * `changedAt` is when the key changed, if the server said.
   */
  | {
      status: 'signedOut'
      ended: SessionEndReason | null
      changedAt?: number | null
      keptData: boolean
    }

/** Why signing in with a ticket didn't finish. Nothing was kept. */
export class WebSignInError extends Error {
  constructor(
    readonly reason: /** The session opened for another account than the one expected. */
    | 'wrongAccount'
      /**
       * Signing in again (`keepData`) as another account than this browser's:
       * nothing is wiped, and the session it opened is closed.
       */
      | 'otherAccount'
      /** The browser couldn't store the key or the session. */
      | 'storage'
      /**
       * A web sign-up's key, of an account that may exist, is here: another
       * account's would replace it.
       */
      | 'signUpPending'
      /**
       * A key from an earlier web sign-up is here, beside a mark that can't be
       * read: it may be an account's.
       */
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
  /**
   * Another account's data was wiped, and every tab is reloading into this one:
   * the caller does nothing more (see `openWebSessionWithTicket`).
   */
  reload: boolean
}

/** A retired key a closed tab hadn't forgotten yet (`keyRetiredPending`). */
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
  /**
   * The account id the local data belongs to, in `secureKv`: written when a
   * session is kept, deleted by the wipe. `SIGNED_OUT_DATA` (`''`) when it was
   * made before anyone signed in (a clean launch notes it).
   */
  owner: {
    read: () => Promise<string | null>
    /** Null deletes it. */
    write: (accountId: string | null) => Promise<void>
  }
  /**
   * Whether storing this key would replace a web sign-up's, of an account that
   * may exist (`createSignUpKeyGuard`). Then nothing is kept.
   */
  signUpKeyHeld?: (
    accountKey: Uint8Array
  ) => Promise<'signUpPending' | 'keyHeld' | null>
  /** Whether the local stores hold anything. */
  hasLocalData: () => boolean | Promise<boolean>
  /**
   * `POST /accounts/v1/sessions` with the ticket, signed by `accountKey`, its
   * sealed label, app version and capabilities (`sendWebSessionOpen`), sending
   * `signed.signed` as it is when given.
   */
  open: (
    ticket: string,
    accountKey: Uint8Array,
    signed: {
      signed?: SignedRequest
      onSigned: (signed: SignedRequest) => void
    }
  ) => Promise<OpenedSession>
  /** Ends a session this browser won't keep (`DELETE …/sessions/current`). */
  closeOpened: (accessToken: string) => Promise<void>
  /** Notes a wipe about to start, so a launch finishes it (`markWipePending`). */
  markWipePending: () => Promise<void>
  /** Deletes all local data, the pending mark last: `clearAllWebData`. */
  wipe: () => Promise<void>
  /**
   * After a sign-in wiped another account's data: saves again what the wipe
   * took that should outlast it, a contact or Buddies link not yet opened
   * (`webLinks.ts`). Signing out keeps nothing.
   */
  afterSignInWipe?: () => Promise<void>
  reload: () => void
  /**
   * The server ended the session: in the tab whose refresh it refused, and
   * (`fromTab`) in each tab that heard of it.
   */
  onEnded?: (
    reason: SessionEndReason,
    outcome: 'wiped' | 'signIn' | 'keyChanged',
    from: { fromTab: boolean }
  ) => void
  /**
   * A key a key change on another device retired, noted (in `secureKv`) before
   * the session is cleared and deleted once the key is forgotten, so a launch
   * finishes what a closed tab started. The wipe deletes it.
   */
  keyRetiredPending: {
    read: () => Promise<KeyRetiredPending | null>
    write: (value: KeyRetiredPending | null) => Promise<void>
  }
  /**
   * The key was retired by a key change on another device: the app forgets it
   * (only while it's still that key) and shows how to sign back in.
   */
  onKeyRetired?: (accountPub: string, changedAt: number | null) => Promise<void>
  /** A session for `accountId` is this browser's now. */
  onSignedIn?: (accountKey: Uint8Array, accountId: string) => void
  now?: () => number
  /** `WEB_CLOSE_WAIT_MS` by default. */
  closeWaitMs?: number
  /** `WEB_SIGN_OUT_FLUSH_MS` by default. */
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
  /**
   * The last `session/open` signed, until its ticket expires: a retry after a
   * lost answer sends it again, which the server answers with the same session
   * (a new signature for a used ticket is `ticket_invalid`). Memory only.
   */
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

  /** Wipes every bit of local data, then reloads this tab and the others. */
  function wipeAndReload(): Promise<void> {
    wiping ??= (async () => {
      deps.accountKey.forget()
      try {
        // Before any other tab hears of it.
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

  /**
   * `WebSessionDeps.decide`, before the stored session is cleared: a
   * `key_changed` session notes its retired key (the stores stay), any reason
   * that wipes marks the wipe pending. A tab that closes partway, the next
   * launch finishes it.
   */
  async function decide(
    reason: SessionEndReason,
    ending: { accountPub: string; changedAt: number | null }
  ): Promise<void> {
    if (reason === 'key_changed') await deps.keyRetiredPending.write(ending)
    else if (sessionEndWipes(reason)) await deps.markWipePending()
  }

  /**
   * Forgets the noted retired key alone, keeping the stores:
   *
   * - `kept`: the key is gone (now, or before a tab closed) and the data stays;
   *   the note is deleted.
   * - `wipe`: a wipe has started, or there's no account's data to keep (`owner`).
   * - `stale`: another key is stored (a sign-in with the new key came after the
   *   note), so the note no longer applies.
   *
   * `wipe` and `stale` leave the note: the wipe deletes it with everything else
   * (`clearAllWebData`), so a tab that closes before the wipe is marked pending
   * still wipes at the next launch, and `start` deletes a stale one itself.
   *
   * At launch the app's handling (`onKeyRetired`) loads after `start`, so
   * `start` doesn't wait for it: the note stays until it has handled the key,
   * and a launch that ends before then handles it again.
   */
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
    // A live tab's handling is installed (`listenForRetiredKeys`, before the
    // app had a key), so the hub settles once it has run.
    await handled
    await clear()
    return wiping ? 'wipe' : 'kept'
  }

  /**
   * Ended by a key change on another device (`key_changed`) while this session
   * was live, in the tab whose refresh was refused: the retired key goes, the
   * stores stay, and the other tabs reload signed out. Anything short of that
   * (no note from `decide`, no data to keep, another key stored) wipes, so the
   * tab never stays signed in without a session.
   */
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

  /** `WebSessionDeps.onEnded`: the server ended the session. */
  function ended(reason: SessionEndReason, { fromTab }: { fromTab: boolean }) {
    if (reason === 'key_changed') {
      // The tab whose refresh was refused decides, and says what it did
      // (`keyRetired` or `wiped`); the others wait for it, signed out.
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
      // Every tab that hears of it wipes: the one whose refresh was refused
      // may close first.
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
        // Wiped by the tab that sent it, or by the next launch.
        deps.accountKey.forget()
        deps.reload()
        return
      case 'signedIn':
        if (state.status !== 'signedIn' || deps.sessions.snapshot() === null)
          deps.reload()
        return
      case 'keyRetired':
        // Another tab forgot the retired key and kept the data.
        deps.accountKey.forget()
        deps.reload()
        return
      case 'rekeyed':
        // Another tab changed the account key and stored the new one.
        deps.reload()
    }
  }

  /**
   * Whether the local data may be another account's: it belongs to someone
   * else, or nothing says whose it is. Unreadable counts as someone else's.
   */
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

  /**
   * Stores the key and adopts the session. Data that may be another account's
   * is wiped first, and then every tab reloads instead of using the new key.
   */
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
      // Storage can't say whose key is here: nothing is kept.
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
    // Signing in again while signed in (Sign In Again): this browser keeps one
    // session, so the one the new replaces ends, once the new one is stored.
    const replacing =
      !switching && deps.sessions.snapshot()?.accountId === opened.accountId
    let wiped = false
    /** The owner before this call wrote it, to put back if nothing is kept. */
    let before: { owner: string | null } | null = null
    try {
      if (switching) {
        // The old account's session ends while its tokens are still here.
        await deps.sessions.close({ waitMs: closeWaitMs })
        deps.accountKey.forget()
        await deps.markWipePending()
        await deps.wipe()
        wiped = true
        await deps.afterSignInWipe?.()
      }
      // After a wipe, nothing is anyone's.
      const owner = wiped ? null : await deps.owner.read()
      await deps.owner.write(opened.accountId)
      before = { owner }
      // This page still holds the old data in memory: the key loads after the
      // reload.
      if (switching) await deps.accountKey.seal(accountKey)
      else await deps.accountKey.save(accountKey)
      const adopted = await deps.sessions.adopt(
        accountKey,
        opened,
        replacing ? { replace: { waitMs: closeWaitMs } } : undefined
      )
      if (adopted === 'failed')
        throw new Error('The session could not be saved')
      // Signed in again: a retired key noted before no longer applies. Only
      // once the new key and session are kept: until then the note still
      // explains why this browser is signed out (and one left beside the new
      // key changes nothing at launch).
      await deps.keyRetiredPending.write(null).catch(() => undefined)
    } catch (error) {
      void deps.closeOpened(opened.accessToken).catch(() => undefined)
      // No session was kept: the data isn't this account's.
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
    /**
     * Reads what's stored and listens to the other tabs, once. Signed in when
     * the key and a session are here.
     */
    async start(): Promise<WebAccountState> {
      if (started) return started
      started = (async () => {
        deps.tabs.subscribe(receive)
        await deps.accountKey.load()
        await deps.sessions.ready()
        // A key change on another device that a closed tab hadn't finished.
        let pending: KeyRetiredPending | null
        try {
          pending = await deps.keyRetiredPending.read()
        } catch {
          // Whether the session still stands can't be told: sign-in, and the
          // note stays for the next launch.
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
            // The session the change ended, which no refresh may replay.
            // `forget` saves its `null` in the background, maybe after the
            // note's delete lands. A launch in between finds no note and that
            // session stored without a key: it shows sign-in, and signing in
            // replaces the session.
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
    /**
     * Opens this browser's web session with a sign-in ticket (a passkey's, an
     * approval's, or a recovery key's) for `accountKey`, then keeps both.
     * `expectAccountId` (an approval's) closes a session for any other account.
     * `keepData` (Sign In Again) never wipes: a session for another account
     * than this browser's data is closed (`otherAccount`). Throws `HttpError`
     * when the server refuses (`ticket_invalid`, …), `WebSignInError`
     * otherwise. Retrying with the same ticket after a failure sends the same
     * signed request, within the ticket's lifetime.
     *
     * With `reload` true, every tab is already reloading: the sign-in flow
     * stops there, and the page that loads is signed in (`start`). Whatever the
     * flow shows after signing in comes from that state, or from a mark the
     * flow kept before calling (the sign-up gate's). `onStored` runs once the
     * key and session are stored, before any tab reloads (waiting at most
     * `WEB_CLOSE_WAIT_MS`): an approval's `done`, which a reload would cut
     * off.
     */
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
    /**
     * Keeps the web session `web/signup` answered with, for the key sign-up
     * made and stored first (`webAccountKey.create`).
     */
    adoptSignupSession: (
      accountKey: Uint8Array,
      opened: OpenedSession
    ): Promise<WebSignIn> => keep(accountKey, opened),
    /**
     * Signs this browser out: closes the session (waiting at most
     * `WEB_CLOSE_WAIT_MS`: the close needs the stored refresh token, which the
     * wipe deletes), wipes the key, the session and every store, and reloads
     * every tab. The wipe is marked pending first, so closing the tab while the
     * server is asked still wipes.
     */
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
    /**
     * Runs `hook` when this browser signs out, while its session is still open
     * and before anything is wiped: Cloud Sync sends a change still waiting, so
     * the account keeps it. Waits at most `WEB_SIGN_OUT_FLUSH_MS` for all of
     * them, and a hook's failure doesn't stop the sign-out. Returns the
     * unsubscribe.
     */
    beforeSignOut(hook: () => Promise<unknown>): () => void {
      signOutHooks.add(hook)
      return () => {
        signOutHooks.delete(hook)
      }
    },
    ended,
    /**
     * This browser changed its account key and stored the new one (step 4): the
     * other tabs reload onto it.
     */
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
