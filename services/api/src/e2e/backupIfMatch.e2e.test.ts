import { afterAll, describe, expect, it } from 'vitest'
import { accountSignedMessage } from '../accounts/contracts'
import {
  b64u,
  randomBytes,
  randomId,
  sha256B64u,
} from '../test/buddiesClient'
import {
  DEV_BYPASS_TOKEN,
  bearerHeaders,
  http,
  httpBytes,
  openSession,
  writeTranscript,
  type E2ESession,
} from '../test/e2e'

/**
 * `If-Match` on `backup/put` (re-sealing a backup after an account key change
 * must never roll back a newer backup or re-create a deleted one) over real
 * HTTP and the local R2: the etag from `list`/`get`/`put`, a match, a stale
 * etag, a deleted slot, a weak or malformed header, and no header. A slot
 * takes one put a minute, so this waits twice. Writes
 * `.verify/artifacts/e2e-backupIfMatch-*.json`.
 */

afterAll(() => {
  writeTranscript('backupIfMatch')
})

const encoder = new TextEncoder()
const MINUTE_AND_A_BIT = 61_000
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const put = async (
  session: E2ESession,
  slotId: string,
  bytes: Uint8Array,
  ifMatch?: string
) =>
  httpBytes('/accounts/v1/backup/put', {
    bytes,
    headers: {
      ...bearerHeaders(session),
      'x-ww-slot-id': slotId,
      'x-ww-sha256': await sha256B64u(bytes),
      ...(ifMatch !== undefined ? { 'if-match': ifMatch } : {}),
    },
  })

const get = (session: E2ESession, slotId: string) =>
  httpBytes('/accounts/v1/backup/get', {
    json: { slotId },
    headers: bearerHeaders(session),
  })

const slots = async (session: E2ESession) =>
  (
    await http('POST', '/accounts/v1/backup/list', {
      headers: bearerHeaders(session),
      body: {},
    })
  ).body.slots as { slotId: string; etag: string; size: number }[]

const remove = async (session: E2ESession, slotId: string) => {
  const bytes = encoder.encode(
    JSON.stringify({
      accountPub: session.key.publicKey,
      ts: Date.now(),
      nonce: randomId(),
      slotId,
    })
  )
  return http('POST', '/accounts/v1/backup/delete', {
    headers: bearerHeaders(session),
    body: {
      payload: b64u(bytes),
      signature: b64u(
        await session.key.sign(accountSignedMessage('backup/delete', bytes))
      ),
    },
  })
}

describe.skipIf(!DEV_BYPASS_TOKEN)('backup/put If-Match on the local worker', () => {
  it('replaces only the bytes it read', async () => {
    const session = await openSession()
    const slotId = randomId()
    const first = randomBytes(1_024)

    // No header: unchanged. The put returns the slot's etag, as list and get do.
    const created = await put(session, slotId, first)
    expect(created.status).toBe(200)
    const etag1 = created.body.etag as string
    expect(created.headers.get('etag')).toBe(`"${etag1}"`)
    expect((await slots(session)).find((s) => s.slotId === slotId)?.etag).toBe(etag1)
    const read = await get(session, slotId)
    expect(read.headers.get('etag')).toBe(`"${etag1}"`)
    expect(read.bytes).toEqual(first)

    // A slot that doesn't exist: 412, and nothing is created.
    const ghost = randomId()
    const missing = await put(session, ghost, randomBytes(64), `"${etag1}"`)
    expect(missing).toMatchObject({ status: 412, body: { code: 'precondition_failed' } })
    expect((await get(session, ghost)).status).toBe(404)

    // A weak, unquoted, `*`, or list header is a bad request; nothing changes.
    for (const header of [`W/"${etag1}"`, etag1, '*', `"${etag1}", "${etag1}"`])
      expect(await put(session, slotId, randomBytes(64), header)).toMatchObject({
        status: 400,
        body: { code: 'bad_request' },
      })

    // The slot's one-a-minute limit still applies to a conditional put.
    expect(await put(session, slotId, randomBytes(64), `"${etag1}"`)).toMatchObject({
      status: 429,
      body: { code: 'rate_limited' },
    })
    expect((await get(session, slotId)).bytes).toEqual(first)

    // A match replaces the slot and returns the new etag.
    await wait(MINUTE_AND_A_BIT)
    const second = randomBytes(2_048)
    const matched = await put(session, slotId, second, `"${etag1}"`)
    expect(matched.status).toBe(200)
    const etag2 = matched.body.etag as string
    expect(etag2).not.toBe(etag1)
    expect((await get(session, slotId)).bytes).toEqual(second)

    // The stale etag no longer matches: 412, and the newer backup stays.
    await wait(MINUTE_AND_A_BIT)
    const stale = await put(session, slotId, randomBytes(64), `"${etag1}"`)
    expect(stale).toMatchObject({ status: 412, body: { code: 'precondition_failed' } })
    const after = await get(session, slotId)
    expect(after.bytes).toEqual(second)
    expect(after.headers.get('etag')).toBe(`"${etag2}"`)

    // A deleted slot isn't re-created by a re-seal that read it earlier.
    expect((await remove(session, slotId)).status).toBe(200)
    expect(await put(session, slotId, randomBytes(64), `"${etag2}"`)).toMatchObject({
      status: 412,
      body: { code: 'precondition_failed' },
    })
    expect((await get(session, slotId)).status).toBe(404)
    expect((await slots(session)).some((s) => s.slotId === slotId)).toBe(false)
  }, 180_000)
})
