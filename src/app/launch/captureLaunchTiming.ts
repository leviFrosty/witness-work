import { AppState } from 'react-native'
import { analytics } from '@/lib/analytics'
import { perf, startupTiming } from '@/lib/perf'

/**
 * Real-world launch speed, once per UTC day per install: time from React
 * Native's start to the first screen, and how much of it ran JS. Call after
 * `reportLaunch`, which marks the first screen.
 */
export function captureLaunchTiming(): void {
  // A launch that started in the background (push, widget refresh) measures
  // the wait for the user, not the app.
  if (AppState.currentState !== 'active') return
  const timing = startupTiming()
  const ready = perf.snapshot().marks.navReady
  if (!timing?.startTime || ready === undefined) return
  const launchMs = Math.round(ready - timing.startTime)
  // Different clocks would show up as nonsense; drop it rather than skew data.
  if (launchMs <= 0 || launchMs > 60_000) return
  const jsStart = timing.executeJavaScriptBundleEntryPointStart
  analytics.capture('app_launch_timed', {
    launch_ms: launchMs,
    js_ms: jsStart ? Math.round(ready - jsStart) : undefined,
  })
}
