import type { AttestedRequest } from '@/lib/attestation/appAttest'
import { createAccountSessions } from '@/lib/serverAccount/session'

export const interopRelayUrl = process.env.BUDDIES_RELAY_URL
export const interopDevBypass =
  process.env.ACCOUNTS_DEV_BYPASS ?? process.env.EXPO_PUBLIC_API_DEV_BYPASS
export const interopEnabled = Boolean(interopRelayUrl && interopDevBypass)

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
