import {
  ed25519PublicKey,
  hkdf,
  sha256,
  x25519PublicKey,
  x25519SharedSecret,
} from '@/features/buddies/lib/crypto'
import { toB64u } from '@/features/buddies/lib/bytes'

/** Key schedule from docs/buddies-protocol.md. Labels are wire-stable. */

const EMPTY = new Uint8Array(0)

export type BuddyIdentity = {
  /** Ed25519 seed that signs owner ops on the relay. */
  ownerSeed: Uint8Array
  ownerPub: string
  /** X25519 private key used only for pairing. */
  dhPrivate: Uint8Array
  dhPub: string
  inboxId: string
  rosterKey: Uint8Array
}

export function deriveIdentity(rootSeed: Uint8Array): BuddyIdentity {
  if (rootSeed.length !== 32) throw new Error('Root seed must be 32 bytes')
  const ownerSeed = hkdf(rootSeed, EMPTY, 'ww-buddies/v1/owner-sign', 32)
  const dhPrivate = hkdf(rootSeed, EMPTY, 'ww-buddies/v1/identity-dh', 32)
  return {
    ownerSeed,
    ownerPub: toB64u(ed25519PublicKey(ownerSeed)),
    dhPrivate,
    dhPub: toB64u(x25519PublicKey(dhPrivate)),
    inboxId: toB64u(hkdf(rootSeed, EMPTY, 'ww-buddies/v1/inbox-id', 16)),
    rosterKey: hkdf(rootSeed, EMPTY, 'ww-buddies/v1/roster-key', 32),
  }
}

export type InviteSecrets = {
  inviteId: string
  inviteKey: Uint8Array
  claimSecret: string
  claimVerifier: string
}

export function deriveInvite(secret: Uint8Array): InviteSecrets {
  if (secret.length !== 16) throw new Error('Invite secret must be 16 bytes')
  const claimSecret = hkdf(secret, EMPTY, 'ww-buddies/v1/invite/claim', 32)
  return {
    inviteId: toB64u(hkdf(secret, EMPTY, 'ww-buddies/v1/invite/id', 16)),
    inviteKey: hkdf(secret, EMPTY, 'ww-buddies/v1/invite/key', 32),
    claimSecret: toB64u(claimSecret),
    claimVerifier: toB64u(sha256(claimSecret)),
  }
}

/** Both people derive the same pair secret regardless of who invited whom. */
export function derivePairSecret(
  myDhPrivate: Uint8Array,
  theirDhPub: Uint8Array,
  inviteSecret: Uint8Array,
  inboxA: string,
  inboxB: string
): Uint8Array {
  const [low, high] = inboxA < inboxB ? [inboxA, inboxB] : [inboxB, inboxA]
  return hkdf(
    x25519SharedSecret(myDhPrivate, theirDhPub),
    inviteSecret,
    `ww-buddies/v1/pair|${low}|${high}`,
    32
  )
}

export type DirectionKeys = {
  slotId: string
  writerSeed: Uint8Array
  writerPub: string
  contentKey: Uint8Array
}

/** Keys for messages flowing into `recipientInboxId`. */
export function deriveDirection(
  pairSecret: Uint8Array,
  recipientInboxId: string
): DirectionKeys {
  const writerSeed = hkdf(
    pairSecret,
    EMPTY,
    `ww-buddies/v1/writer|${recipientInboxId}`,
    32
  )
  return {
    slotId: toB64u(
      hkdf(pairSecret, EMPTY, `ww-buddies/v1/slot|${recipientInboxId}`, 16)
    ),
    writerSeed,
    writerPub: toB64u(ed25519PublicKey(writerSeed)),
    contentKey: hkdf(
      pairSecret,
      EMPTY,
      `ww-buddies/v1/content|${recipientInboxId}`,
      32
    ),
  }
}
