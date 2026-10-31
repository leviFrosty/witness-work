import { getRandomBytes } from 'expo-crypto'
import apis from '@/constants/apis'
import { parseRecoveryKey } from '@/lib/accountKey/recoveryKey'
import { webAccountKey } from '@/lib/accountKey/webAccountKey'
import { ensureSyncDeviceId } from '@/lib/iCloudIdentity'
import { syncNow } from '@/lib/syncClock'
import {
  accountSessions,
  bearerOptions,
  fetchServerAccountInfo,
  webAccount as pageAccount,
} from '@/lib/serverAccount'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import { openTicketedSocket } from '@/lib/serverAccount/liveTicket'
import { createPasskey, getPasskey } from '@/lib/passkeys'
import { webRecovery } from '@/lib/serverAccount/passkeyClient'
import { addPasskeyFlow } from '@/lib/serverAccount/passkeyFlow'
import { accountPasskeyDeps } from '@/lib/serverAccount/passkeyServer'
import { webSignIn } from '@/app/web-sign-in/webSignInRuntime'

/**
 * Dev builds on the web only: the browser's account session for Playwright
 * (`globalThis.__WW_WEB_SESSION__`), in the active tab and in one showing "open
 * in another tab". Every call returns a promise; nothing returns a token, a
 * ticket or the key. The approval link is the QR's, which the screen shows.
 */

if (!pageAccount) throw new Error('The web session harness is web only')
const webAccount = pageAccount

const signedInKey = async () => {
  const key = await webAccountKey.peek()
  if (!key) throw new Error('This browser is not signed in')
  return key
}

const snapshot = () => {
  const session = accountSessions.snapshot()
  return session
    ? {
        accountId: session.accountId,
        sessionId: session.sessionId,
        sessionExpiresAt: session.sessionExpiresAt,
        hasAccessToken: session.accessExpiresAt !== null,
      }
    : null
}

const harness = {
  state: async () => {
    await webAccount.start()
    return {
      account: webAccount.state(),
      hasKey: (await webAccountKey.peek()) !== null,
      session: snapshot(),
    }
  },
  /** Web recovery with Turnstile's test token, then the web session. */
  signInWithRecoveryKey: async (
    recoveryKey: string,
    turnstileToken = 'XXXX.DUMMY.TOKEN.XXXX'
  ) => {
    const parsed = parseRecoveryKey(recoveryKey)
    if (!parsed.ok) throw new Error(`recovery key: ${parsed.problem}`)
    const { ticket } = await webRecovery(
      { turnstileToken },
      {
        baseUrl: apis.accounts,
        key: deriveAccountSigningKey(parsed.accountKey),
        now: syncNow,
        randomBytes: getRandomBytes,
      }
    )
    return webAccount.openWebSessionWithTicket(ticket, parsed.accountKey)
  },
  /** A refresh now, as when the access token runs out. */
  refresh: async () => {
    await accountSessions.withSession(async () => undefined, {
      accountKey: await signedInKey(),
      renew: true,
    })
    return snapshot()
  },
  /** A bearer call (`GET /accounts/v1/account`). */
  readAccount: async () =>
    (await fetchServerAccountInfo(await signedInKey())).accountId,
  signOut: () => webAccount.signOut(),
  /**
   * Adds a passkey in this browser (its authenticator, PRF included) as the
   * signed-in account. `wrap: false` leaves it without a wrap, as a passkey
   * whose wrap didn't save: it signs in but can't unlock yet.
   */
  addPasskey: async ({ wrap = true }: { wrap?: boolean } = {}) => {
    const { options: _, ...account } = accountPasskeyDeps(await signedInKey())
    return addPasskeyFlow({
      ...account,
      server: {
        ...account.server,
        wrap: async (args) => {
          if (!wrap) throw new Error('Left without a wrap')
          await account.server.wrap(args)
        },
      },
      ceremonies: { create: createPasskey, get: getPasskey },
      confirmOwner: async () => 'confirmed',
      randomBytes: getRandomBytes,
    })
  },
  /** The sign-in flow's state: no keys, tickets or PRF output. */
  signInState: async () => webSignIn().state(),
  /** The "Use my phone" QR's link while it shows, as a phone would scan it. */
  approvalLink: async () => {
    const approval = webSignIn().currentApproval()
    return approval?.state.step === 'showing' ? approval.state.link : null
  },
  /**
   * Opens the sync live socket the way Cloud Sync does on the web, and reports
   * how it went within `waitMs`.
   */
  openSyncSocket: async (waitMs = 8_000) => {
    const socket = (await openTicketedSocket(
      {
        url: `${apis.accounts.replace(/^http/, 'ws')}/accounts/v1/sync/live`,
        socket: 'sync',
        id: ensureSyncDeviceId(),
      },
      bearerOptions(await signedInKey())
    )) as unknown as WebSocket
    return new Promise<{
      opened: boolean
      protocol: string
      message: string | null
      close: { code: number; reason: string } | null
    }>((resolve) => {
      let opened = false
      let message: string | null = null
      const done = (close: { code: number; reason: string } | null) => {
        clearTimeout(timer)
        resolve({ opened, protocol: socket.protocol, message, close })
        socket.onclose = null
        socket.close(1000)
      }
      const timer = setTimeout(() => done(null), waitMs)
      socket.onopen = () => {
        opened = true
      }
      socket.onmessage = (event) => {
        message = String(event.data)
        done(null)
      }
      socket.onclose = (event) =>
        done({ code: event.code, reason: event.reason })
    })
  },
}

export function installWebSessionHarness() {
  // A tab showing "open in another tab" hears the active one's tokens too.
  void webAccount.start().catch(() => undefined)
  ;(globalThis as { __WW_WEB_SESSION__?: typeof harness }).__WW_WEB_SESSION__ =
    harness
}
