import type * as WatchVisualModule from '@/features/updates/components/reveal/visuals/WatchVisual'
import type SiriVisualComponent from '@/features/updates/components/reveal/visuals/SiriVisual'
import type YearPaceVisualComponent from '@/features/updates/components/reveal/visuals/YearPaceVisual'
import type TimeVisualComponent from '@/features/onboarding/components/tour/TimeVisual'
import { canvasKitComponent } from '@/lib/canvasKit/canvasKitComponent'

export const WatchVisual = canvasKitComponent(
  (): typeof WatchVisualModule.default =>
    require('@/features/updates/components/reveal/visuals/WatchVisual').default
)

export const HoursWatch = canvasKitComponent(
  (): typeof WatchVisualModule.HoursWatch =>
    require('@/features/updates/components/reveal/visuals/WatchVisual')
      .HoursWatch
)

export const SiriVisual = canvasKitComponent(
  (): typeof SiriVisualComponent =>
    require('@/features/updates/components/reveal/visuals/SiriVisual').default
)

export const YearPaceVisual = canvasKitComponent(
  (): typeof YearPaceVisualComponent =>
    require('@/features/updates/components/reveal/visuals/YearPaceVisual')
      .default
)

export const TimeVisual = canvasKitComponent(
  (): typeof TimeVisualComponent =>
    require('@/features/onboarding/components/tour/TimeVisual').default
)
