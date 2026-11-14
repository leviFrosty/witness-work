import { describe, expect, it, vi } from 'vitest'
import {
  handleAdminResetRequest,
  type AdminResetDependencies,
} from './admin'

const VALID_METER = 'account_12345678'

const makeDeps = (token: string | undefined = 'correct-token') => {
  const resetUsage = vi.fn(async () => ({
    previousCount: 4,
    hadActiveWindow: true,
    deletedEmptyRuns: 2,
  }))
  const indexFor = vi.fn(() => ({
    objectId: 'opaque-do-id',
    resetUsage,
  }))
  return {
    deps: { adminToken: token, indexFor } satisfies AdminResetDependencies,
    indexFor,
    resetUsage,
  }
}

const request = (token?: string, body: unknown = { meterId: VALID_METER }) =>
  new Request('https://worker/admin/notes-import/reset', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-ww-admin-token': token } : {}),
    },
    body: JSON.stringify(body),
  })

const responseBody = async (response: Response) => ({
  status: response.status,
  body: await response.json(),
})

describe('admin Notes Import usage reset', () => {
  it('returns the same 404 when configuration or credentials are missing/wrong', async () => {
    for (const [configured, supplied] of [
      [undefined, undefined],
      [undefined, 'anything'],
      ['correct-token', undefined],
      ['correct-token', 'wrong-token'],
    ] as const) {
      const { deps, indexFor } = makeDeps(configured)
      await expect(
        handleAdminResetRequest(request(supplied), deps).then(responseBody)
      ).resolves.toEqual({
        status: 404,
        body: { ok: false, error: 'not_found', code: 'not_found' },
      })
      expect(indexFor).not.toHaveBeenCalled()
    }
  })

  it('rejects an invalid meter identity without creating a Durable Object', async () => {
    const { deps, indexFor } = makeDeps()
    await expect(
      handleAdminResetRequest(
        request('correct-token', { meterId: 'bad|identity' }),
        deps
      ).then(responseBody)
    ).resolves.toEqual({
      status: 400,
      body: { ok: false, error: 'Invalid meterId', code: 'bad_request' },
    })
    expect(indexFor).not.toHaveBeenCalled()
  })

  it('invokes the serialized reset and emits a privacy-safe audit event', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { deps, indexFor, resetUsage } = makeDeps()
    await expect(
      handleAdminResetRequest(request('correct-token'), deps).then(responseBody)
    ).resolves.toEqual({ status: 200, body: { ok: true } })
    expect(indexFor).toHaveBeenCalledWith(VALID_METER)
    expect(resetUsage).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledWith({
      event: 'notes_import_usage_reset',
      objectId: 'opaque-do-id',
      previousUsed: 4,
      hadActiveWindow: true,
      deletedEmptyRuns: 2,
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain(VALID_METER)
    log.mockRestore()
  })

  it('takes an account id, the meter of bearer requests', async () => {
    const { deps, indexFor } = makeDeps()
    // A server account id: 22 base64url characters, `-` and `_` included.
    const accountId = 'Ab-9_xYz01234567890aBc'
    await expect(
      handleAdminResetRequest(
        request('correct-token', { meterId: accountId }),
        deps
      ).then(responseBody)
    ).resolves.toEqual({ status: 200, body: { ok: true } })
    expect(indexFor).toHaveBeenCalledWith(accountId)
    vi.restoreAllMocks()
  })
})
