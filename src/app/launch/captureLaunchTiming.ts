import { AppState } from 'react-native'
import { analytics } from '@/lib/analytics'
import { perf, startupTiming } from '@/lib/perf'

export function captureLaunchTiming(): void {
  if (AppState.currentState !== 'active') return
  const timing = startupTiming()
  const ready = perf.snapshot().marks.navReady
  if (!timing?.startTime || ready === undefined) return
  const launchMs = Math.round(ready - timing.startTime)

  if (launchMs <= 0 || launchMs > 60_000) return
  const jsStart = timing.executeJavaScriptBundleEntryPointStart
  analytics.capture('app_launch_timed', {
    launch_ms: launchMs,
    js_ms: jsStart ? Math.round(ready - jsStart) : undefined,
  })
}
