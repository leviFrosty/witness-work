/**
 * Launch timing and work counters, for before/after profiling.
 *
 * `perf.count` is a map increment, cheap enough to leave at every call site in
 * release builds. Nothing is logged or wrapped unless the probe is on: bundles
 * built with `EXPO_PUBLIC_PERF_PROBE=1` (scripts/perf) print `[ww-perf]` JSON
 * lines that the runner reads from the device log, and dev builds expose
 * `__WW_DEV__.perf()`.
 */
type Counters = Record<string, number>

export const counters: Counters = {}
const marks: Record<string, number> = {}

export const perfProbeEnabled =
  process.env.EXPO_PUBLIC_PERF_PROBE === '1' ||
  process.env.EXPO_PUBLIC_PERF_PROBE === 'true'

export const now = () => performance.now()

export function startupTiming() {
  try {
    // React Native's own extension; absent from the DOM typings.
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
  /** Records the first time a launch milestone is reached. */
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
