import { View } from 'react-native'
import moment from 'moment'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { mileageDateToLocalDate } from '@/lib/mileage'
import useMileage from '@/stores/mileage'

export default function PendingMileageTrips({
  onResume,
  vehicleId,
}: {
  onResume: (id: string) => void
  vehicleId?: string
}) {
  const theme = useTheme()
  const { entries, vehicles } = useMileage()
  const pending = entries.filter(
    (entry) =>
      entry.status === 'inProgress' &&
      (!vehicleId || entry.vehicleId === vehicleId)
  )
  if (!pending.length) return null
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontFamily: theme.fonts.semiBold }}>
        {i18n.t('mileage.entries.inProgress')}
      </Text>
      {pending.map((entry) => (
        <Button
          key={entry.id}
          onPress={() => onResume(entry.id)}
          style={{
            padding: 16,
            gap: 6,
            backgroundColor: theme.colors.card,
            borderRadius: theme.numbers.borderRadiusSm,
          }}
        >
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {vehicles.find((vehicle) => vehicle.id === entry.vehicleId)?.name ??
              i18n.t('mileage.common.vehicle')}
          </Text>
          <Text style={{ color: theme.colors.textAlt }}>
            {moment(mileageDateToLocalDate(entry.date)).format('ll')}
          </Text>
          <Text style={{ color: theme.colors.accent }}>
            {i18n.t('mileage.entries.resume')}
          </Text>
        </Button>
      ))}
    </View>
  )
}
