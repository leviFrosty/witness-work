import type { ReactNode } from 'react'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Text from '@/components/ui/MyText'
import InfoPopover from '@/components/ui/InfoPopover'
import type { MileageSummary as Summary } from '@/lib/mileage/calc'
import type { MileageFormatter } from '@/features/mileage/lib/format'
import type { VehicleChartColor } from '@/features/mileage/lib/chartColors'
import type { Vehicle } from '@/types/mileage'

type Props = {
  summary: Summary
  vehicles: Vehicle[]
  format: MileageFormatter
  /** List per-car totals when more than one car has trips. */
  showBreakdown?: boolean
  /** Shown between the totals and the per-car breakdown. */
  chart?: ReactNode
  /** Keys each car in the breakdown to its color in `chart`. */
  vehicleColors?: VehicleChartColor[]
}

function Stat({
  label,
  value,
  info,
}: {
  label: string
  value: string
  info?: string
}) {
  const theme = useTheme()
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
        {info && <InfoPopover title={label} description={info} inline />}
      </View>
      <Text
        style={{ fontSize: theme.fontSize('xl'), fontFamily: theme.fonts.bold }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  )
}

/** Distance, trips, and estimated cost, plus an optional per-car breakdown. */
export default function MileageSummary({
  summary,
  vehicles,
  format,
  showBreakdown,
  chart,
  vehicleColors,
}: Props) {
  const theme = useTheme()
  const breakdown = showBreakdown && summary.byVehicle.length > 1

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Stat
          label={i18n.t('mileage.distance')}
          value={format.distance(summary.distanceMiles)}
        />
        <Stat
          label={i18n.t('mileage.trips')}
          value={summary.tripCount.toLocaleString()}
        />
        {summary.cost !== undefined && (
          <Stat
            label={i18n.t('mileage.estimatedCost')}
            value={format.cost(summary.cost)}
            info={i18n.t('mileage.estimatedCost_info')}
          />
        )}
      </View>
      {summary.costIncomplete && (
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t('mileage.costIncomplete')}
        </Text>
      )}
      {chart}
      {breakdown && (
        <View
          style={{
            gap: 8,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
          }}
        >
          {summary.byVehicle.map((car) => {
            const color = vehicleColors?.find(
              (c) => c.vehicleId === car.vehicleId
            )?.color
            return (
              <View
                key={car.vehicleId}
                style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}
              >
                {color && (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: color,
                    }}
                  />
                )}
                <Text
                  style={{ flex: 1, fontFamily: theme.fonts.medium }}
                  numberOfLines={1}
                >
                  {vehicles.find((v) => v.id === car.vehicleId)?.name ??
                    i18n.t('mileage.unknownCar')}
                </Text>
                <Text style={{ color: theme.colors.textAlt }}>
                  {[
                    format.distance(car.distanceMiles),
                    car.cost !== undefined && format.cost(car.cost),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}
