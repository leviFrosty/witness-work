import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({ os: 'web' }))
const readLaunchAppConfig = vi.hoisted(() => vi.fn())

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.os
    },
  },
}))

vi.mock('@/lib/appUpdate/launchConfig', () => ({ readLaunchAppConfig }))

const fetchMock = vi.fn()

beforeEach(() => {
  vi.resetModules()
  runtime.os = 'web'
  fetchMock.mockReset()
  readLaunchAppConfig.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
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
  return import('@/lib/readVisitorLocation')
}

const config = (location?: { country: unknown; regionCode: unknown }) => ({
  minAppVersion: null,
  sync: null,
  ...(location && { location }),
})

const traceSays = (loc: string) =>
  fetchMock.mockResolvedValue({
    ok: true,
    text: async () => `fl=1\nloc=${loc}\ntls=TLSv1.3\n`,
  })

it("uses the app config's country and region, without the trace", async () => {
  readLaunchAppConfig.mockResolvedValue(
    config({ country: 'CA', regionCode: 'MB' })
  )
  traceSays('US')
  const { readVisitorLocation, readVisitorCountry } = await load()
  await expect(readVisitorLocation()).resolves.toEqual({
    country: 'CA',
    regionCode: 'MB',
  })
  await expect(readVisitorCountry()).resolves.toBe('CA')
  expect(readLaunchAppConfig).toHaveBeenCalledTimes(1)
  expect(fetchMock).not.toHaveBeenCalled()
})

it('reads the trace, with no region, when the config fails', async () => {
  readLaunchAppConfig.mockRejectedValue(new Error('offline'))
  traceSays('CA')
  const { readVisitorLocation } = await load()
  await expect(readVisitorLocation()).resolves.toEqual({
    country: 'CA',
    regionCode: null,
  })
  await expect(readVisitorLocation()).resolves.toEqual({
    country: 'CA',
    regionCode: null,
  })
  // A failed config isn't kept: each read asks it again, then the trace.
  expect(readLaunchAppConfig).toHaveBeenCalledTimes(2)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(fetchMock.mock.calls[0][0]).toBe('/cdn-cgi/trace')
})

it('reads the trace when an older worker sends no country', async () => {
  readLaunchAppConfig.mockResolvedValue(config())
  traceSays('MX')
  const { readVisitorLocation, readVisitorCountry } = await load()
  await expect(readVisitorLocation()).resolves.toEqual({
    country: 'MX',
    regionCode: null,
  })
  await expect(readVisitorCountry()).resolves.toBe('MX')
})

it('reads the trace when the config says the country is unknown', async () => {
  readLaunchAppConfig.mockResolvedValue(
    config({ country: null, regionCode: null })
  )
  traceSays('GB')
  const { readVisitorLocation } = await load()
  await expect(readVisitorLocation()).resolves.toEqual({
    country: 'GB',
    regionCode: null,
  })
})

it("doesn't wait forever for the config", async () => {
  vi.useFakeTimers()
  readLaunchAppConfig.mockReturnValue(new Promise(() => {}))
  traceSays('CA')
  const { readVisitorLocation } = await load()
  const read = readVisitorLocation()
  await vi.advanceTimersByTimeAsync(10_000)
  await expect(read).resolves.toEqual({ country: 'CA', regionCode: null })
})

it('treats a missing trace (a dev server answering with its page) as unknown', async () => {
  readLaunchAppConfig.mockRejectedValue(new Error('offline'))
  fetchMock.mockResolvedValue({ ok: true, text: async () => '<!doctype html>' })
  const { readVisitorLocation, readVisitorCountry } = await load()
  await expect(readVisitorLocation()).resolves.toEqual({
    country: null,
    regionCode: null,
  })
  await expect(readVisitorCountry()).resolves.toBeNull()
})

it('treats a failed trace as unknown', async () => {
  readLaunchAppConfig.mockResolvedValue(config())
  fetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => '' })
  const { readVisitorCountry } = await load()
  await expect(readVisitorCountry()).resolves.toBeNull()
})

it('uses the development override instead of the config and trace', async () => {
  const { readVisitorLocation, readVisitorCountry } = await load('gb')
  await expect(readVisitorLocation()).resolves.toEqual({
    country: 'GB',
    regionCode: null,
  })
  await expect(readVisitorCountry()).resolves.toBe('GB')
  expect(readLaunchAppConfig).not.toHaveBeenCalled()
  expect(fetchMock).not.toHaveBeenCalled()
})

it('takes a province in the development override', async () => {
  const { readVisitorLocation } = await load('ca-mb')
  await expect(readVisitorLocation()).resolves.toEqual({
    country: 'CA',
    regionCode: 'MB',
  })
  expect(readLaunchAppConfig).not.toHaveBeenCalled()
})

it('never reads it on a phone', async () => {
  runtime.os = 'ios'
  const { readVisitorLocation, readVisitorCountry } = await load('GB')
  await expect(readVisitorLocation()).resolves.toEqual({
    country: null,
    regionCode: null,
  })
  await expect(readVisitorCountry()).resolves.toBeNull()
  expect(readLaunchAppConfig).not.toHaveBeenCalled()
  expect(fetchMock).not.toHaveBeenCalled()
})
