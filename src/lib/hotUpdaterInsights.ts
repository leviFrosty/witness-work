import { insights } from '@hot-updater/react-native'
import { analyticsEventsAllowed } from '@/lib/analyticsPolicy'

type InsightsPlugin = ReturnType<typeof insights>
type InsightsSetup = Exclude<ReturnType<InsightsPlugin['setup']>, void>
type InsightsHooks = NonNullable<InsightsSetup['hooks']>

export function anonymousInsights(
  allowed: () => boolean = analyticsEventsAllowed
): InsightsPlugin {
  const plugin = insights()
  return {
    ...plugin,
    setup(context) {
      const setup = plugin.setup(context)
      if (!setup?.hooks) return setup
      const hooks = Object.fromEntries(
        Object.entries(setup.hooks).map(([name, hook]) => [
          name,
          (payload: never) => (allowed() ? hook(payload) : undefined),
        ])
      ) as InsightsHooks
      return { ...setup, hooks }
    },
  }
}
