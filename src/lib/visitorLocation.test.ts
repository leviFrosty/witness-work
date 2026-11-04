import { describe, expect, it, vi } from 'vitest'
import {
  createVisitorLocation,
  parseCloudflareTrace,
  parseDevLocation,
  parseVisitorLocation,
} from '@/lib/visitorLocation'

const trace = (loc: string) =>
  `fl=123f45\nh=app.witnesswork.app\nip=203.0.113.7\nts=1761800000.123\nvisit_scheme=https\nuag=Mozilla/5.0\ncolo=DFW\nsliver=none\nhttp=http/2\n${loc}\ntls=TLSv1.3\nsni=plaintext\nwarp=off\ngateway=off\nrbi=off\nkex=X25519\n`

describe('parseCloudflareTrace', () => {
  it('reads the country from loc=', () => {
    expect(parseCloudflareTrace(trace('loc=US'))).toBe('US')
    expect(parseCloudflareTrace(trace('loc=de'))).toBe('DE')
    expect(parseCloudflareTrace('loc=GB\r\n')).toBe('GB')
  })

  it('treats unknown and Tor countries as unknown', () => {
    expect(parseCloudflareTrace(trace('loc=XX'))).toBeNull()
    expect(parseCloudflareTrace(trace('loc=T1'))).toBeNull()
  })

  it('treats a missing or malformed loc as unknown', () => {
    for (const text of [
      '',
      trace(''),
      trace('loc='),
      trace('loc=USA'),
      trace('loc=U'),
      trace('loc=1A'),
      trace('xloc=US'),
      'loc = US',
      '<html>Not found</html>',
      null,
      undefined,
      42,
    ]) {
      expect(parseCloudflareTrace(text as string)).toBeNull()
    }
  })

  it('uses the first loc line', () => {
    expect(parseCloudflareTrace('loc=CA\nloc=FR')).toBe('CA')
  })
})

describe('parseVisitorLocation', () => {
  it('reads a country and its region', () => {
    expect(parseVisitorLocation('CA', 'MB')).toEqual({
      country: 'CA',
      regionCode: 'MB',
    })
    expect(parseVisitorLocation('ca', 'on')).toEqual({
      country: 'CA',
      regionCode: 'ON',
    })
    expect(parseVisitorLocation('GB', 'ENG')).toEqual({
      country: 'GB',
      regionCode: 'ENG',
    })
    expect(parseVisitorLocation('FR', '75')).toEqual({
      country: 'FR',
      regionCode: '75',
    })
  })

  it('drops a country prefix on the region', () => {
    expect(parseVisitorLocation('CA', 'CA-SK')).toEqual({
      country: 'CA',
      regionCode: 'SK',
    })
  })

  it('treats a malformed region as unknown', () => {
    for (const region of ['', 'ABCD', 'M B', 'US-CA', null, undefined, 42]) {
      expect(parseVisitorLocation('CA', region)).toEqual({
        country: 'CA',
        regionCode: null,
      })
    }
  })

  it('has no region without a country', () => {
    for (const country of [null, undefined, 'XX', 'T1', 'CAN', '', 1]) {
      expect(parseVisitorLocation(country, 'MB')).toEqual({
        country: null,
        regionCode: null,
      })
    }
  })
})

describe('parseDevLocation', () => {
  it('reads a country, or a country and region', () => {
    expect(parseDevLocation('gb')).toEqual({ country: 'GB', regionCode: null })
    expect(parseDevLocation('CA-MB')).toEqual({
      country: 'CA',
      regionCode: 'MB',
    })
    expect(parseDevLocation('ca-on')).toEqual({
      country: 'CA',
      regionCode: 'ON',
    })
  })

  it('ignores anything else', () => {
    for (const value of ['', 'USA', 'XX', 'CA-', 'CA-ABCD', 'CA MB', null]) {
      expect(parseDevLocation(value)).toBeNull()
    }
  })
})

const CANADA_MB = { country: 'CA', regionCode: 'MB' }

describe('createVisitorLocation', () => {
  it('uses the config, and reads it once per launch', async () => {
    const fetchConfigLocation = vi.fn(async () => CANADA_MB)
    const fetchTrace = vi.fn(async () => trace('loc=US'))
    const visitor = createVisitorLocation({ fetchConfigLocation, fetchTrace })
    const [a, b] = await Promise.all([visitor.location(), visitor.location()])
    expect(a).toEqual(CANADA_MB)
    expect(b).toEqual(CANADA_MB)
    expect(await visitor.location()).toEqual(CANADA_MB)
    expect(fetchConfigLocation).toHaveBeenCalledTimes(1)
    expect(fetchTrace).not.toHaveBeenCalled()
  })

  it('falls back to the trace, with no region, when the config fails', async () => {
    const visitor = createVisitorLocation({
      fetchConfigLocation: async () => {
        throw new Error('offline')
      },
      fetchTrace: async () => trace('loc=ca'),
    })
    expect(await visitor.location()).toEqual({
      country: 'CA',
      regionCode: null,
    })
  })

  it('asks the config again after it failed, and keeps its answer', async () => {
    const fetchConfigLocation = vi
      .fn<() => Promise<typeof CANADA_MB | null>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ country: 'CA', regionCode: 'ON' })
    const fetchTrace = vi.fn(async () => trace('loc=CA'))
    const visitor = createVisitorLocation({ fetchConfigLocation, fetchTrace })
    expect(await visitor.location()).toEqual({
      country: 'CA',
      regionCode: null,
    })
    expect(await visitor.location()).toEqual({
      country: 'CA',
      regionCode: 'ON',
    })
    expect(await visitor.location()).toEqual({
      country: 'CA',
      regionCode: 'ON',
    })
    expect(fetchConfigLocation).toHaveBeenCalledTimes(2)
    expect(fetchTrace).toHaveBeenCalledTimes(1)
  })

  it('asks again after both failed', async () => {
    const fetchConfigLocation = vi
      .fn<() => Promise<typeof CANADA_MB | null>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(CANADA_MB)
    const visitor = createVisitorLocation({
      fetchConfigLocation,
      fetchTrace: async () => {
        throw new Error('offline')
      },
    })
    expect(await visitor.location()).toEqual({
      country: null,
      regionCode: null,
    })
    expect(await visitor.location()).toEqual(CANADA_MB)
  })

  it('falls back to the trace when the config has no country (an older worker)', async () => {
    const fetchTrace = vi.fn(async () => trace('loc=GB'))
    const visitor = createVisitorLocation({
      fetchConfigLocation: async () => null,
      fetchTrace,
    })
    expect(await visitor.location()).toEqual({
      country: 'GB',
      regionCode: null,
    })
    expect(fetchTrace).toHaveBeenCalledTimes(1)
  })

  it('gives unknown when the config has no country and the trace fails, and keeps that answer', async () => {
    const fetchTrace = vi.fn(async () => {
      throw new Error('offline')
    })
    const visitor = createVisitorLocation({
      fetchConfigLocation: async () => null,
      fetchTrace,
    })
    const unknown = { country: null, regionCode: null }
    expect(await visitor.location()).toEqual(unknown)
    expect(await visitor.location()).toEqual(unknown)
    expect(fetchTrace).toHaveBeenCalledTimes(1)
  })

  it('uses an injected override without reading anything', async () => {
    const fetchConfigLocation = vi.fn(async () => CANADA_MB)
    const fetchTrace = vi.fn(async () => trace('loc=US'))
    for (const [devOverride, expected] of [
      ['de', { country: 'DE', regionCode: null }],
      ['CA-SK', { country: 'CA', regionCode: 'SK' }],
    ] as const) {
      const visitor = createVisitorLocation({
        fetchConfigLocation,
        fetchTrace,
        devOverride,
      })
      expect(await visitor.location()).toEqual(expected)
    }
    expect(fetchConfigLocation).not.toHaveBeenCalled()
    expect(fetchTrace).not.toHaveBeenCalled()
  })

  it('ignores an override that is not a location', async () => {
    for (const devOverride of ['', 'USA', 'XX', 'CA-', null, undefined]) {
      const visitor = createVisitorLocation({
        fetchConfigLocation: async () => null,
        fetchTrace: async () => trace('loc=US'),
        devOverride,
      })
      expect(await visitor.location()).toEqual({
        country: 'US',
        regionCode: null,
      })
    }
  })
})
