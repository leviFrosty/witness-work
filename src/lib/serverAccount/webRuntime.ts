import type { WebAccountKey } from '@/lib/accountKey/webAccountKey'
import type { DeviceLabel } from '@/lib/serverAccount/deviceLabel'
import type {
  AccountSessions,
  SessionStore,
  WebSessionDeps,
} from '@/lib/serverAccount/session'
import type { WebAccount, WebAccountDeps } from '@/lib/serverAccount/webAccount'

export type WebAccountHooks = Pick<
  WebAccountDeps,
  'onKeyRetired' | 'onSignedIn'
>

export type WebRuntime = {
  sessionStore: SessionStore

  sessionDeps: WebSessionDeps
  deviceLabel: () => DeviceLabel

  accountKey: WebAccountKey

  bind: (sessions: AccountSessions, hooks?: WebAccountHooks) => WebAccount
}

export const webRuntime: WebRuntime | null = null
