import { expect, it } from 'vitest'
import {
  BUDDIES_ENVELOPE_HEADERS,
  BUDDIES_LIMITS,
  BUDDIES_OPS,
  BUDDIES_OWNER_OPS,
  BUDDIES_UNSIGNED_OPS,
} from '../../src/buddies/contracts'
import { accountSignedMessage, inboxLinkMessage } from '../../src/accounts/contracts'
import { BUDDIES_ABUSE_LIMITS } from '../../src/buddies/limits'
import { signedMessage, verifyBuddiesSignature } from '../../src/buddies/envelope'
import * as wire from './buddies-wire.mjs'

/** Keeps the verify fuzzer's plain-Node wire client in sync with the relay. */

it('mirrors the relay limits the fuzzer probes', () => {
  for (const [name, value] of Object.entries(wire.WIRE_LIMITS)) {
    expect(BUDDIES_LIMITS[name as keyof typeof BUDDIES_LIMITS], name).toBe(value)
  }
})

it('mirrors the per-caller edge limits', () => {
  const edge = Object.fromEntries(
    Object.entries(BUDDIES_ABUSE_LIMITS.edge).map(([tier, { perMinute }]) => [tier, perMinute])
  )
  expect(wire.WIRE_EDGE_LIMITS).toEqual(edge)
})

it('knows every op', () => {
  expect([...wire.ALL_OPS].sort()).toEqual([...BUDDIES_OPS].sort())
  expect(wire.UNSIGNED_OPS).toEqual([...BUDDIES_UNSIGNED_OPS])
  expect(wire.OWNER_OPS).toEqual([...BUDDIES_OWNER_OPS])
  expect(wire.ENVELOPE_HEADERS).toEqual(BUDDIES_ENVELOPE_HEADERS)
})

it('signs exactly what the relay verifies', async () => {
  const key = await wire.signingKeyFromSeed(new Uint8Array(32).fill(7))
  const envelope = await wire.signedEnvelope('inbox/sync', { since: 0 }, key)
  const payloadBytes = wire.fromB64u(envelope.payload)
  expect(wire.signedMessage('inbox/sync', payloadBytes)).toEqual(
    signedMessage('inbox/sync', payloadBytes)
  )
  expect(
    await verifyBuddiesSignature(key.publicKey, 'inbox/sync', payloadBytes, wire.fromB64u(envelope.signature))
  ).toBe(true)
})

it('signs account envelopes and inbox links as the accounts routes verify them', async () => {
  const key = await wire.signingKeyFromSeed(new Uint8Array(32).fill(9))
  const envelope = await wire.accountEnvelope('session/open', key)
  const payloadBytes = wire.fromB64u(envelope.payload)
  expect(wire.accountSignedMessage('session/open', payloadBytes)).toEqual(
    accountSignedMessage('session/open', payloadBytes)
  )
  expect(JSON.parse(new TextDecoder().decode(payloadBytes))).toMatchObject({
    accountPub: key.publicKey,
  })
  const ids = ['A'.repeat(22), 'B'.repeat(22), key.publicKey] as const
  expect(wire.inboxLinkMessage(...ids)).toEqual(inboxLinkMessage(...ids))
})
