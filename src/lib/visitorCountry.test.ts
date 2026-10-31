import { describe, expect, it, vi } from 'vitest'
import {
  createVisitorCountry,
  parseCloudflareTrace,
} from '@/lib/visitorCountry'

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

describe('createVisitorCountry', () => {
  it('reads the trace once per launch', async () => {
    const fetchTrace = vi.fn(async () => trace('loc=fr'))
    const visitor = createVisitorCountry({ fetchTrace })
    const [a, b] = await Promise.all([visitor.country(), visitor.country()])
    expect(a).toBe('FR')
    expect(b).toBe('FR')
    expect(await visitor.country()).toBe('FR')
    expect(fetchTrace).toHaveBeenCalledTimes(1)
  })

  it('gives unknown when the trace fails, and keeps that answer', async () => {
    const fetchTrace = vi.fn(async () => {
      throw new Error('offline')
    })
    const visitor = createVisitorCountry({ fetchTrace })
    expect(await visitor.country()).toBeNull()
    expect(await visitor.country()).toBeNull()
    expect(fetchTrace).toHaveBeenCalledTimes(1)
  })

  it('uses an injected override without reading the trace', async () => {
    const fetchTrace = vi.fn(async () => trace('loc=US'))
    const visitor = createVisitorCountry({ fetchTrace, devOverride: 'de' })
    expect(await visitor.country()).toBe('DE')
    expect(fetchTrace).not.toHaveBeenCalled()
  })

  it('ignores an override that is not a country', async () => {
    for (const devOverride of ['', 'USA', 'XX', null, undefined]) {
      const visitor = createVisitorCountry({
        fetchTrace: async () => trace('loc=US'),
        devOverride,
      })
      expect(await visitor.country()).toBe('US')
    }
  })
})
