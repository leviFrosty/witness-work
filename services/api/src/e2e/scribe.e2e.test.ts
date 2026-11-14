import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { accessTokenKeys, signAccessToken } from '../accounts/tokens'
import {
  ACCOUNT_TOKEN_SECRET,
  ADMIN_TOKEN,
  BASE_URL,
  DEV_BYPASS_TOKEN,
  LOCAL_LAUNCHER,
  configured,
  http,
  localKv,
  nextIp,
  openSession,
  writeTranscript,
  type E2ESession,
} from '../test/e2e'
import { SCRIBE_TOOLS, sendStep, stepBody, ulid, userMessage } from '../test/scribeFixture'

/**
 * Scribe AI's lifecycle against the local worker, without the model: the
 * public status, usage on dev and iOS tokens, every refusal a step can get
 * before admission (validation, step limit, context estimate, the kill
 * switch, the protocol minimum, the meter), the legacy cutover, attestation
 * status, and the admin reset. Nothing here reaches OpenRouter's
 * completions, so it's free; one real step runs only with
 * WW_API_E2E_ALLOW_PAID=1 (`scribeModel.e2e.test.ts` has the full set).
 *
 * The KV cases flip the launcher's isolated local KV and restore it.
 */

const LOCAL = LOCAL_LAUNCHER && DEV_BYPASS_TOKEN != null
const PAID =
  process.env.WW_API_E2E_ALLOW_PAID === '1' && LOCAL && configured('OPENROUTER_API_KEY')

afterAll(() => {
  writeTranscript('scribe')
})

const SCRIBE_KEYS = [
  'scribe:enabled',
  'scribe:limits',
  'scribe:protocol-min',
  'scribe:legacy-notes-import',
] as const

/** Restores the Scribe AI keys a test changed. */
const kvSnapshot = () => {
  const saved = new Map<string, string | null>()
  for (const key of SCRIBE_KEYS) {
    const value = localKv('get', key).trim()
    // wrangler prints this for a key that isn't there.
    saved.set(key, value === '' || value === 'Value not found' ? null : value)
  }
  return () => {
    for (const [key, value] of saved) {
      if (value == null) localKv('delete', key)
      else localKv('put', key, value)
    }
  }
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

const iosToken = async (session: E2ESession): Promise<string> => {
  const keys = await accessTokenKeys({
    ACCOUNT_TOKEN_SECRET: ACCOUNT_TOKEN_SECRET!,
    APP_ATTEST_ENVIRONMENT: 'development',
  })
  return (
    await signAccessToken(keys!, {
      accountId: session.accountId,
      sessionId: session.sessionId,
      platform: 'ios',
    })
  ).accessToken
}

const body = (overrides: Record<string, unknown> = {}) =>
  stepBody(
    {
      conversationId: ulid(),
      turnId: ulid(),
      step: 0,
      messages: [userMessage('Log two hours this morning')],
    },
    overrides
  )

const step = (token: string, payload: unknown) =>
  http('POST', '/scribe/v1/step', { headers: bearer(token), body: payload })

describe('public routes', () => {
  it('GET /scribe/v1/status answers the protocol range and limits', async () => {
    const res = await http('GET', '/scribe/v1/status')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.body).toMatchObject({
      ok: true,
      protocol: { min: expect.any(Number), max: 1 },
      limits: { maxStepsPerTurn: expect.any(Number), maxTools: 24 },
    })
    expect(typeof res.body.enabled).toBe('boolean')
  })

  it('GET /attestation/v1/status answers the attestation capabilities', async () => {
    const res = await http('GET', '/attestation/v1/status')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, capabilities: { appAttest: expect.any(Object) } })
    expect(res.body.providers).toEqual(res.body.capabilities)
  })

  it('refuses usage and steps without a bearer token', async () => {
    const usage = await http('GET', '/scribe/v1/usage')
    expect(usage.status).toBe(401)
    expect(usage.body.code).toBe('unauthorized')
    const res = await http('POST', '/scribe/v1/step', { body: body() })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toMatch(/^Bearer/)
  })
})

describe.skipIf(!LOCAL)('on an account session', () => {
  let session: E2ESession
  let restore: (() => void) | null = null

  beforeAll(async () => {
    session = await openSession()
  })

  afterEach(() => {
    restore?.()
    restore = null
  })

  it('shows a dev session unlimited usage and an iOS token the free window', async () => {
    const dev = await http('GET', '/scribe/v1/usage', { headers: bearer(session.accessToken) })
    expect(dev.status).toBe(200)
    expect(dev.body).toMatchObject({ ok: true, plan: 'free', limited: false })
    expect(dev.body.windows[0]).toMatchObject({ id: 'weekly', units: { limit: -1 } })
    if (!ACCOUNT_TOKEN_SECRET) return
    const ios = await http('GET', '/scribe/v1/usage', {
      headers: bearer(await iosToken(session)),
    })
    expect(ios.body.windows[0].units.limit).toBeGreaterThan(0)
  })

  it('validates before anything is metered', async () => {
    const token = session.accessToken
    const cases: [unknown, number, string][] = [
      [body({ protocol: 2 }), 400, 'bad_request'],
      [body({ conversationId: 'nope' }), 400, 'bad_request'],
      [body({ step: 6 }), 400, 'step_limit'],
      [body({ app: { version: '1.46.0', platform: 'windows', locale: 'en-US' } }), 400, 'bad_request'],
      [
        body({ tools: [{ ...SCRIBE_TOOLS[0], inputSchema: { type: 'object', properties: { a: { type: 'string' } }, required: [], additionalProperties: false } }] }),
        400,
        'invalid_tools',
      ],
      [body({ context: { v: 1, pad: 'x'.repeat(20_000) } }), 413, 'too_large'],
    ]
    for (const [payload, status, code] of cases) {
      const res = await step(token, payload)
      expect([res.status, res.body.code]).toEqual([status, code])
    }
    const raw = await http('POST', '/scribe/v1/step', { headers: bearer(token), raw: '{not json' })
    expect([raw.status, raw.body.code]).toEqual([400, 'bad_request'])
    const usage = await http('GET', '/scribe/v1/usage', { headers: bearer(token) })
    expect(usage.body.windows[0].units.used).toBe(0)
  })

  it.each(['ios', 'android', 'web'])('accepts app.platform %s past validation', async (platform) => {
    // The context size is checked right after `app`, so a 413 means the
    // platform passed (an unknown one is a 400 first).
    const res = await step(
      session.accessToken,
      body({
        app: { version: '1.46.0', platform, locale: 'en-US' },
        context: { v: 1, pad: 'x'.repeat(20_000) },
      })
    )
    expect([res.status, res.body.code]).toEqual([413, 'too_large'])
  })

  it('refuses with context_full, disabled, and upgrade_required from KV', async () => {
    restore = kvSnapshot()
    const token = session.accessToken
    localKv('put', 'scribe:limits', JSON.stringify({ maxInputTokens: 1_000 }))
    const full = await step(token, body())
    expect([full.status, full.body.code]).toEqual([413, 'context_full'])
    localKv('delete', 'scribe:limits')

    localKv('put', 'scribe:enabled', 'off')
    const disabled = await step(token, body())
    expect([disabled.status, disabled.body.code]).toEqual([503, 'disabled'])
    expect(disabled.headers.get('retry-after')).toBe('60')
    localKv('delete', 'scribe:enabled')

    localKv('put', 'scribe:protocol-min', '2')
    const old = await step(token, body())
    expect([old.status, old.body.code]).toEqual([426, 'upgrade_required'])
  })

  it.skipIf(!ACCOUNT_TOKEN_SECRET)('402 limit_reached at a zero allowance, with the snapshot', async () => {
    restore = kvSnapshot()
    localKv('put', 'scribe:limits', JSON.stringify({ free: { weekly: 0, welcome: 0 } }))
    const res = await step(await iosToken(session), body())
    expect(res.status).toBe(402)
    expect(res.body).toMatchObject({
      ok: false,
      code: 'limit_reached',
      usage: { plan: 'free', limited: true },
    })
  })

  it('cuts Notes Import over to 426, keeping its status', async () => {
    restore = kvSnapshot()
    localKv('delete', 'scribe:legacy-notes-import')
    const routes: [string, string][] = [
      ['POST', '/notes-import/kickoff'],
      ['POST', '/notes-import'],
      ['POST', '/notes-import/transcribe'],
      ['POST', '/notes-import/challenge'],
      ['GET', `/notes-import/imp_${'0'.repeat(40)}/result`],
    ]
    for (const [method, path] of routes) {
      const res = await http(method, path, {
        headers: bearer(session.accessToken),
        ...(method === 'POST' ? { body: {} } : {}),
      })
      expect([path, res.status, res.body.code]).toEqual([path, 426, 'upgrade_required'])
    }
    // Older composers read usage on open; a 404 keeps the app usable.
    const usage = await http('GET', '/notes-import/usage', { headers: bearer(session.accessToken) })
    expect([usage.status, usage.body.code]).toEqual([404, 'not_found'])
    expect((await http('GET', '/notes-import/status')).status).toBe(200)
    localKv('put', 'scribe:legacy-notes-import', 'on')
    expect((await http('GET', '/notes-import/usage', { headers: bearer(session.accessToken) })).status).toBe(200)
  })

  it.skipIf(!ADMIN_TOKEN)('resets an account’s windows through the admin route', async () => {
    const hidden = await http('POST', '/admin/scribe/reset', { body: { accountId: session.accountId } })
    expect(hidden.status).toBe(404)
    const res = await http('POST', '/admin/scribe/reset', {
      headers: { 'x-ww-admin-token': ADMIN_TOKEN! },
      body: { accountId: session.accountId },
    })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, previous: { monthly: expect.any(Number) } })
  })
})

describe.skipIf(!PAID)('PAID: one real step (WW_API_E2E_ALLOW_PAID=1)', () => {
  it('streams start, a tool call, and done with usage that the meter matches', { timeout: 60_000 }, async () => {
    const session = await openSession()
    const run = await sendStep(
      BASE_URL,
      { ...bearer(session.accessToken), 'cf-connecting-ip': nextIp() },
      body()
    )
    expect(run.status).toBe(200)
    expect(run.events[0].type).toBe('start')
    const done = run.events.at(-1)!
    expect(done.type).toBe('done')
    expect(run.events.some((event) => event.type === 'tool_call')).toBe(true)
    expect(done.usage.units).toBeGreaterThan(0)
    const usage = await http('GET', '/scribe/v1/usage', { headers: bearer(session.accessToken) })
    expect(usage.body.windows[0].units.used).toBe(done.meter.windows[0].units.used)
  })
})
