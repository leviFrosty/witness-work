import { Car as CarIcon } from 'lucide-react-native'
import moment from 'moment'
import i18n from '@/lib/locales'
import {
  periodContaining,
  summarizeTrips,
  tripsInPeriod,
} from '@/lib/mileage/calc'
import useMileage from '@/stores/mileage'
import useMileageFormatter from '@/features/mileage/hooks/useMileageFormatter'
import useMileageIndex from '@/features/mileage/hooks/useMileageIndex'
import StatCard from '@/features/progress/components/cards/StatCard'
import type { ProgressCardProps } from '@/features/progress/components/cards/types'

/** The month's distance driven in service, and its estimated cost. */
export default function MileageCard({ month, year, size }: ProgressCardProps) {
  const { vehicles, trips } = useMileage()
  const index = useMileageIndex()
  const format = useMileageFormatter()
  const period = periodContaining('month', moment({ year, month, day: 1 }))
  const monthTrips = tripsInPeriod(trips, period)
  const summary = summarizeTrips(monthTrips, index, vehicles)

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
