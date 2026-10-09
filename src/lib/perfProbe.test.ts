import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// The profiling runner's reader, so the split and the reassembly stay in step.
import { createPerfReader } from '../../scripts/perf/stats.mjs'

vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}))

describe('reportPerf', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const capture = () => {
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: string) => {
      lines.push(line)
    })
    return lines
  }

  it('prints nothing without the probe', async () => {
    const lines = capture()
    const { reportPerf } = await import('@/lib/perfProbe')
    reportPerf({ type: 'launch' })
    expect(lines).toEqual([])
  })

  it('prints a short report as one line', async () => {
    vi.stubEnv('EXPO_PUBLIC_PERF_PROBE', '1')
    const lines = capture()
    const { reportPerf } = await import('@/lib/perfProbe')
    reportPerf({ type: 'foreground', blockedMs: 12 })
    expect(lines).toEqual(['[ww-perf] {"type":"foreground","blockedMs":12}'])
  })

  it('splits a long report into parts the runner reassembles', async () => {
    vi.stubEnv('EXPO_PUBLIC_PERF_PROBE', '1')
    const lines = capture()
    const { reportPerf } = await import('@/lib/perfProbe')
    const counters = Object.fromEntries(
      Array.from({ length: 120 }, (_, i) => [`net:host/endpoint-${i}`, i])
    )
    const payload = { type: 'launch', counters }
    reportPerf(payload)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every((line) => line.length < 900)).toBe(true)
    const read = createPerfReader()
    // Interleaved with an unrelated report, as device logs may be.
    const results = [
      ...lines.slice(0, 1),
      '[ww-perf] {"type":"active"}',
      ...lines.slice(1),
    ].map(read)
    expect(results.filter(Boolean)).toEqual([{ type: 'active' }, payload])
  })

  it('counts each fetch once, by endpoint, even when it opens an XMLHttpRequest', async () => {
    vi.stubEnv('EXPO_PUBLIC_PERF_PROBE', '1')
    class FakeXhr {
      open(_method: string, _url: string) {}
    }
    // React Native's own fetch is built on XMLHttpRequest; Expo's is native.
    const fetchViaXhr = vi.fn(async (input: string) => {
      new FakeXhr().open('GET', input)
      return new Response('')
    })
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    vi.stubGlobal('fetch', fetchViaXhr)
    const { installPerfProbe } = await import('@/lib/perfProbe')
    const { counters } = await import('@/lib/perf')
    installPerfProbe()
    await fetch('https://api.example.com/buddies/v1/inbox/sync?token=secret')
    new XMLHttpRequest().open('GET', 'https://flags.example.com/decide/')
    new XMLHttpRequest().open(
      'GET',
      'https://flags.example.com/array/phc_a1B2c3D4e5F6g7H8/config'
    )
    expect(fetchViaXhr).toHaveBeenCalledTimes(1)
    expect(counters).toMatchObject({
      'net:total': 3,
      'net:api.example.com/buddies/v1/inbox': 1,
      'net:flags.example.com/decide': 1,
      'net:flags.example.com/array/:id/config': 1,
    })
    vi.unstubAllGlobals()
  })
})
