import { Car as CarIcon } from 'lucide-react-native'
import moment from 'moment'
import i18n from '@/lib/locales'
import {
  type MileagePeriod,
  periodContaining,
  summarizeTrips,
  tripsInPeriod,
} from '@/lib/mileage/calc'
import { useMileageView } from '@/stores/mileageView'
import useMileageFormatter from '@/features/mileage/hooks/useMileageFormatter'
import useMileageIndex from '@/features/mileage/hooks/useMileageIndex'
import StatCard from '@/features/progress/components/cards/StatCard'
import type { ProgressCardProps } from '@/features/progress/components/cards/types'
import type { ProgressCardSize } from '@/lib/progressCards'

/** The month's distance driven in service, and its estimated cost. */
export default function MileageCard({ month, year, size }: ProgressCardProps) {
  return (
    <MileageStatCard
      period={periodContaining('month', moment({ year, month, day: 1 }))}
      size={size}
    />
  )
}

/** Distance driven in service in `period` (every trip without one). */
export function MileageStatCard({
  period,
  size,
}: {
  period?: MileagePeriod
  size: ProgressCardSize
}) {
  const { vehicles, trips } = useMileageView()
  const index = useMileageIndex()
  const format = useMileageFormatter()
  const shown = period ? tripsInPeriod(trips, period) : trips
  const summary = summarizeTrips(shown, index, vehicles)

  return (
    <StatCard
      icon={CarIcon}
      title={i18n.t('mileage.title')}
      value={format.distance(summary.distanceMiles)}
      tone={summary.tripCount ? 'default' : 'muted'}
      caption={
        // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
        i18n.t('mileage.tripCount', { count: summary.tripCount })
      }
      detail={
        summary.cost !== undefined
          ? i18n.t('progressCards.mileage.cost', {
              value: format.cost(summary.cost),
            })
          : undefined
      }
      size={size}
    />
  )
}
