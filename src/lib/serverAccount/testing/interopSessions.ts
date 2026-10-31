import type { AttestedRequest } from '@/lib/attestation/appAttest'
import { createAccountSessions } from '@/lib/serverAccount/session'

/**
 * The worker and dev bypass token the opt-in interop tests run against, e.g.
 * `BUDDIES_RELAY_URL=http://localhost:8787 ACCOUNTS_DEV_BYPASS=local-dev-bypass
 * pnpm exec vitest run interop` with ww-api's `wrangler dev` running (the token
 * is its `NOTES_IMPORT_DEV_BYPASS_TOKEN`). Both unset skips them.
 */
export const interopRelayUrl = process.env.BUDDIES_RELAY_URL
export const interopDevBypass =
  process.env.ACCOUNTS_DEV_BYPASS ?? process.env.EXPO_PUBLIC_API_DEV_BYPASS
export const interopEnabled = Boolean(interopRelayUrl && interopDevBypass)

/**
 * Account sessions against the interop worker, opened with the dev bypass
 * instead of an attestation, and kept in memory. `accountKey` is the one calls
 * without their own use; `baseUrl` another worker than the relay's.
 */
export function interopSessions(
  randomBytes: (length: number) => Uint8Array,
  accountKey = randomBytes(32),
  baseUrl = interopRelayUrl!
) {
  let stored: string | null = null
  return createAccountSessions({
    baseUrl,
    now: Date.now,
    randomBytes,
    attestation: {
      assert: <T>(request: AttestedRequest<T>) =>
        request.submit({ kind: 'devBypass', token: interopDevBypass! }),
    },
    store: {
      read: async () => stored,
      write: async (value) => {
        stored = value
      },
    },
    accountKey: async () => accountKey,
  })
}

/** An account with an open session: its key, id, and bearer options. */
export async function interopAccount(
  randomBytes: (length: number) => Uint8Array,
  accountKey = randomBytes(32)
) {
  const sessions = interopSessions(randomBytes, accountKey)
  const { accountId } = await sessions.ensure(accountKey)
  return {
    accountKey,
    accountId,
    sessions,
    bearer: {
      baseUrl: interopRelayUrl!,
      authorize: <T>(run: (authorization: string) => Promise<T>) =>
        sessions.withSession(run, { accountKey }),
    },
  }
}
