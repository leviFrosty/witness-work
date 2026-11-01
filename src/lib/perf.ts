type Counters = Record<string, number>

export const counters: Counters = {}
const marks: Record<string, number> = {}

export const perfProbeEnabled =
  process.env.EXPO_PUBLIC_PERF_PROBE === '1' ||
  process.env.EXPO_PUBLIC_PERF_PROBE === 'true'

export const now = () => performance.now()

export function startupTiming() {
  try {
    const timing = (
      performance as unknown as {
        rnStartupTiming: {
          startTime?: number | null
          initializeRuntimeStart?: number | null
          executeJavaScriptBundleEntryPointStart?: number | null
          endTime?: number | null
        }
      }
    ).rnStartupTiming
    return {
      startTime: timing.startTime ?? null,
      initializeRuntimeStart: timing.initializeRuntimeStart ?? null,
      executeJavaScriptBundleEntryPointStart:
        timing.executeJavaScriptBundleEntryPointStart ?? null,
      endTime: timing.endTime ?? null,
    }
  } catch {
    return null
  }
}

export const perf = {
  mark(name: string): void {
    if (!(name in marks)) marks[name] = now()
  },
  count(name: string, by = 1): void {
    counters[name] = (counters[name] ?? 0) + by
  },
  snapshot() {
    return {
      marks: { ...marks },
      counters: { ...counters },
      startup: startupTiming(),
    }
  },
}
