import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleScribeAdminReset } from './admin'

const ACCOUNT = 'acct_1234567890abcdef'
const PREVIOUS = { session: 1_200, weekly: 9_000, monthly: 9_000 }

const makeDeps = (token: string | undefined = 'correct-token') => {
  const resetUsage = vi.fn(async () => ({ previous: PREVIOUS }))
  const meterFor = vi.fn(() => ({ resetUsage }))
  return { deps: { adminToken: token, meterFor }, meterFor, resetUsage }
}

const request = (token?: string, body: unknown = { accountId: ACCOUNT }) =>
  new Request('https://worker/admin/scribe/reset', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-ww-admin-token': token } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

const answer = async (response: Response) => ({
  status: response.status,
  body: await response.json(),
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /admin/scribe/reset', () => {
  it('is the same 404 for missing configuration or credentials', async () => {
    for (const [configured, supplied] of [
      [undefined, undefined],
      [undefined, 'anything'],
      ['correct-token', undefined],
      ['correct-token', 'wrong-token'],
    ] as const) {
      const { deps, meterFor } = makeDeps(configured)
      expect(await answer(await handleScribeAdminReset(request(supplied), deps))).toEqual({
        status: 404,
        body: { ok: false, error: 'not_found', code: 'not_found' },
      })
      expect(meterFor).not.toHaveBeenCalled()
    }
  })

  it('refuses a bad body without touching a meter', async () => {
    for (const body of ['not json', { accountId: 'bad|id' }, { accountId: 'short' }, {}]) {
      const { deps, meterFor } = makeDeps()
      const response = await handleScribeAdminReset(request('correct-token', body), deps)
      expect(response.status).toBe(400)
      expect(meterFor).not.toHaveBeenCalled()
    }
  })

  it('resets the account’s meter and logs only the previous totals', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { deps, meterFor, resetUsage } = makeDeps()
    expect(await answer(await handleScribeAdminReset(request('correct-token'), deps))).toEqual({
      status: 200,
      body: { ok: true, previous: PREVIOUS },
    })
    expect(meterFor).toHaveBeenCalledWith(ACCOUNT)
    expect(resetUsage).toHaveBeenCalledTimes(1)
    const lines = log.mock.calls.map((args) => String(args[0]))
    expect(lines).toEqual([JSON.stringify({ event: 'scribe_admin_reset', previous: PREVIOUS })])
    expect(lines.join('')).not.toContain(ACCOUNT)
  })

  it('accepts the meterId field the old reset script sent', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { deps, meterFor } = makeDeps()
    const response = await handleScribeAdminReset(request('correct-token', { meterId: ACCOUNT }), deps)
    expect(response.status).toBe(200)
    expect(meterFor).toHaveBeenCalledWith(ACCOUNT)
  })
})

describe('pnpm admin:reset-usage', () => {
  const load = () => import('../../scripts/reset-notes-import-usage.mjs')

  it('resets the account’s Scribe AI windows on production by default', async () => {
    const { resolveResetCommand } = await load()
    expect(resolveResetCommand([ACCOUNT], { ADMIN_API_TOKEN: 'prod-token' })).toEqual({
      path: '/admin/scribe/reset',
      body: { accountId: ACCOUNT },
      baseUrl: 'https://api.witnesswork.app',
      token: 'prod-token',
      environment: 'production',
    })
  })

  it('selects the Beta URL and token with --beta', async () => {
    const { resolveResetCommand } = await load()
    expect(
      resolveResetCommand(['--beta', ACCOUNT], {
        ADMIN_API_TOKEN: 'prod-token',
        ADMIN_API_TOKEN_BETA: 'beta-token',
        WW_API_BETA_URL: 'https://beta-api.example/',
      })
    ).toMatchObject({
      baseUrl: 'https://beta-api.example',
      token: 'beta-token',
      environment: 'beta',
    })
  })

  it('defaults --beta to api-beta.witnesswork.app, and either default to an override', async () => {
    const { resolveResetCommand } = await load()
    expect(
      resolveResetCommand(['--beta', ACCOUNT], { ADMIN_API_TOKEN_BETA: 'beta-token' }).baseUrl
    ).toBe('https://api-beta.witnesswork.app')
    expect(
      resolveResetCommand([ACCOUNT], {
        ADMIN_API_TOKEN: 'prod-token',
        WW_API_PROD_URL: 'https://ww-proxy.leviwilkerson.com',
      }).baseUrl
    ).toBe('https://ww-proxy.leviwilkerson.com')
  })

  it('reaches the old Notes Import reset with --notes-import', async () => {
    const { resolveResetCommand } = await load()
    expect(
      resolveResetCommand(['--notes-import', ACCOUNT], { ADMIN_API_TOKEN: 'prod-token' })
    ).toMatchObject({ path: '/admin/notes-import/reset', body: { meterId: ACCOUNT } })
  })

  it('refuses a malformed id or a missing token', async () => {
    const { resolveResetCommand } = await load()
    expect(() => resolveResetCommand(['bad id!'], { ADMIN_API_TOKEN: 't' })).toThrow(/Usage/)
    expect(() => resolveResetCommand([ACCOUNT], {})).toThrow(/ADMIN_API_TOKEN/)
    expect(() =>
      resolveResetCommand(['--beta', ACCOUNT], { ADMIN_API_TOKEN: 'prod-token' })
    ).toThrow(/ADMIN_API_TOKEN_BETA/)
  })

  // Nothing is deployed for development: its admin routes are reached on the
  // local worker with curl and the launcher's token.
  it('has no --dev: the old flag and its variables select nothing', async () => {
    const { resolveResetCommand } = await load()
    expect(() =>
      resolveResetCommand(['--dev', ACCOUNT], {
        ADMIN_API_TOKEN: 'prod-token',
        ADMIN_API_TOKEN_DEV: 'dev-token',
        WW_API_DEV_URL: 'https://dev-api.example',
      })
    ).toThrow(/Usage/)
  })
})
