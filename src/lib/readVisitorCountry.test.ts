import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({ os: 'web' }))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.os
    },
  },
}))

const fetchMock = vi.fn()

beforeEach(() => {
  vi.resetModules()
  runtime.os = 'web'
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const load = async (devCountry: string | null = null) => {
  const address = await import('@/lib/launchAddress')
  address.setLaunchAddress({
    returnedAppUserId: null,
    forwardedReturn: false,
    devCountry,
    devBuyGate: false,
  })
  return import('@/lib/readVisitorCountry')
}

it('reads the trace once per launch', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    text: async () => 'fl=1\nloc=MX\ntls=TLSv1.3\n',
  })
  const { readVisitorCountry } = await load()
  await expect(readVisitorCountry()).resolves.toBe('MX')
  await expect(readVisitorCountry()).resolves.toBe('MX')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0][0]).toBe('/cdn-cgi/trace')
})

it('treats a missing trace (a dev server answering with its page) as unknown', async () => {
  fetchMock.mockResolvedValue({ ok: true, text: async () => '<!doctype html>' })
  const { readVisitorCountry } = await load()
  await expect(readVisitorCountry()).resolves.toBeNull()
})

it('treats a failed trace as unknown', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => '' })
  const { readVisitorCountry } = await load()
  await expect(readVisitorCountry()).resolves.toBeNull()
})

it('uses the development override instead of the trace', async () => {
  const { readVisitorCountry } = await load('gb')
  await expect(readVisitorCountry()).resolves.toBe('GB')
  expect(fetchMock).not.toHaveBeenCalled()
})

it('never reads it on a phone', async () => {
  runtime.os = 'ios'
  const { readVisitorCountry } = await load('GB')
  await expect(readVisitorCountry()).resolves.toBeNull()
  expect(fetchMock).not.toHaveBeenCalled()
})
