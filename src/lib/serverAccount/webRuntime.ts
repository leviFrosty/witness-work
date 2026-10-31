import type { WebAccountKey } from '@/lib/accountKey/webAccountKey'
import type { DeviceLabel } from '@/lib/serverAccount/deviceLabel'
import type {
  AccountSessions,
  SessionStore,
  WebSessionDeps,
} from '@/lib/serverAccount/session'
import type { WebAccount, WebAccountDeps } from '@/lib/serverAccount/webAccount'

/** What the app does around a browser's account, past its storage. */
export type WebAccountHooks = Pick<
  WebAccountDeps,
  'retiredKey' | 'lastAccountId' | 'onKeyRetired' | 'onSignedIn'
>

/**
 * A browser's account plumbing (docs/passkeys-protocol.md, "On the web"): the
 * sealed key and session record in IndexedDB, the tabs that share the session,
 * and the account that signs in and out. `webRuntime.web.ts` has it; phones get
 * null here, so none of it (sealed secrets, IndexedDB, `webAccount`) is in
 * their bundle.
 */
export type WebRuntime = {
  /** The session record, sealed in IndexedDB. */
  sessionStore: SessionStore
  /** The session engine's `web` mode. */
  sessionDeps: WebSessionDeps
  deviceLabel: () => DeviceLabel
  /** This browser's account key. */
  accountKey: WebAccountKey
  /** Makes the page's account, once, from the session engine. */
  bind: (sessions: AccountSessions, hooks?: WebAccountHooks) => WebAccount
}

export const webRuntime: WebRuntime | null = null
