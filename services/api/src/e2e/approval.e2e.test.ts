import { afterAll, describe, expect, it } from 'vitest'
import { DEV_BYPASS_TOKEN, http, openSession, writeTranscript } from '../test/e2e'
import { b64u, randomBytes, randomId } from '../test/buddiesClient'
import { PasskeyClient, authorization } from '../test/passkeys'

/**
 * Approving a browser from a phone over real HTTP (witness-work
 * `docs/passkeys-protocol.md`): the browser opens a channel, a phone session
 * (dev bypass) claims it, both read it, the phone sends the key, the browser
 * receives it with an `approval` ticket and opens its web session, and calls
 * done; plus the refusals that need the real runtime (a web session's claim,
 * five wrong tokens). The blobs are opaque here; `.verify/scripts/approval.mjs`
 * runs the same with the contract's real crypto. Writes
 * `.verify/artifacts/e2e-approval-*.json`.
 */

const client = new PasskeyClient((method, path, body, headers) =>
  http(method, `/accounts/v1${path}`, { body, headers })
)
const post = (op: string, body: unknown, headers?: Record<string, string>) =>
  http('POST', `/accounts/v1/approval/${op}`, { body, headers })
const sha256 = async (token: string) =>
  b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', Buffer.from(token, 'base64url'))))
const blob = () => b64u(randomBytes(64))

const openChannel = async () => {
  const channelId = randomId()
  const claimToken = randomId()
  const browserToken = randomId()
  const opened = await post('open', {
    channelId,
    verifier: await sha256(claimToken),
    browserVerifier: await sha256(browserToken),
    hello: blob(),
  })
  expect(opened.status).toBe(200)
  return { channelId, claimToken, browserToken, expiresAt: opened.body.expiresAt as number }
}

afterAll(() => {
  writeTranscript('approval')
})

describe.skipIf(!DEV_BYPASS_TOKEN)('approving a browser on the local worker', () => {
  it('relays the key and opens the browser’s web session with the ticket', async () => {
    const phone = await openSession()
    const channel = await openChannel()
    expect(channel.expiresAt - Date.now()).toBeLessThanOrEqual(75_000)
    const phonePub = b64u(randomBytes(32))
    const claimed = await post(
      'claim',
      { channelId: channel.channelId, claimToken: channel.claimToken, phonePub },
      authorization(phone.accessToken)
    )
    expect(claimed.status).toBe(200)
    expect(typeof claimed.body.far).toBe('boolean')
    expect(claimed.body.expiresAt - Date.now()).toBeGreaterThan(290_000)

    const browserView = { channelId: channel.channelId, browserToken: channel.browserToken }
    expect((await post('status', browserView)).body).toMatchObject({ status: 'claimed', phonePub })
    const key = blob()
    expect((await post('send', { channelId: channel.channelId, key }, authorization(phone.accessToken))).status).toBe(200)
    const received = await post('receive', browserView)
    expect(received.body).toMatchObject({ status: 'sent', key })
    expect((await post('receive', browserView)).body.ticket).toBe(received.body.ticket)

    const { reply } = await client.openWeb(phone.key, received.body.ticket, { appVersion: '1.46.0' })
    expect(reply).toMatchObject({ status: 201, body: { accountId: phone.accountId, platform: 'web' } })
    expect((await post('done', browserView)).status).toBe(200)
    expect((await post('receive', browserView)).body).toEqual({ ok: true, status: 'done' })

    const activity = await http('GET', '/accounts/v1/activity', { headers: authorization(phone.accessToken) })
    expect(activity.body.activity.slice(0, 2)).toMatchObject([
      { kind: 'session.opened', method: 'approval', actor: { sessionId: phone.sessionId } },
      { kind: 'device.approved', session: { sessionId: phone.sessionId } },
    ])

    // A web session can't claim.
    const other = await openChannel()
    expect(
      await post(
        'claim',
        { channelId: other.channelId, claimToken: other.claimToken, phonePub },
        authorization(reply.body.accessToken)
      )
    ).toMatchObject({ status: 403, body: { error: 'forbidden' } })
  })

  it('burns a channel after five wrong tokens', async () => {
    const channel = await openChannel()
    for (let i = 0; i < 5; i++)
      expect(
        await post('status', { channelId: channel.channelId, browserToken: randomId() })
      ).toMatchObject({ status: 401, body: { error: 'bad_signature' } })
    expect(
      (await post('status', { channelId: channel.channelId, browserToken: channel.browserToken })).body.status
    ).toBe('cancelled')
  })
})
