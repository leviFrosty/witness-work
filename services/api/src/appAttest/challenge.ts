import { randomToken } from '../crypto'

/**
 * App Attest challenges. The proxy issues a one-time random challenge; the
 * client folds it into the data it attests/asserts, proving freshness. Stored
 * in KV with a short TTL and consumed (deleted) on first use so an assertion or
 * attestation can't be replayed.
 */

export type ChallengeKv = Pick<KVNamespace, 'get' | 'put' | 'delete'>

const CHALLENGE_PREFIX = 'chal:'

/** Default challenge lifetime (KV minimum TTL is 60s). */
export const DEFAULT_CHALLENGE_TTL_SECONDS = 300

export const issueChallenge = async (
  kv: ChallengeKv,
  ttlSeconds: number = DEFAULT_CHALLENGE_TTL_SECONDS
): Promise<string> => {
  const challenge = randomToken(32)
  await kv.put(`${CHALLENGE_PREFIX}${challenge}`, '1', {
    expirationTtl: Math.max(60, ttlSeconds),
  })
  return challenge
}

export const hasChallenge = async (
  kv: ChallengeKv,
  challenge: string
): Promise<boolean> => {
  if (!challenge) return false
  return (await kv.get(`${CHALLENGE_PREFIX}${challenge}`)) != null
}

export const deleteChallenge = (
  kv: ChallengeKv,
  challenge: string
): Promise<void> => kv.delete(`${CHALLENGE_PREFIX}${challenge}`)

/**
 * Returns true iff the challenge was issued and unused, deleting it so it can't
 * be reused. False for an unknown/expired/already-consumed challenge.
 */
export const consumeChallenge = async (
  kv: ChallengeKv,
  challenge: string
): Promise<boolean> => {
  if (!challenge) return false
  const key = `${CHALLENGE_PREFIX}${challenge}`
  const found = await kv.get(key)
  if (found == null) return false
  await kv.delete(key)
  return true
}
