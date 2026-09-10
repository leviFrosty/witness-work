import { View } from 'react-native'
import { Car, ChevronRight } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import moment from 'moment'
import Button from '@/components/ui/Button'
import { useCardStyle } from '@/components/ui/Card'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import useMileageUnit from '@/hooks/useMileageUnit'
import i18n, { _i18n } from '@/lib/locales'
import { formatMileageDistance } from '@/lib/mileage'
import useMileage from '@/stores/mileage'
import type { MileagePeriod } from '@/types/mileage'
import type { RootStackNavigation } from '@/types/rootStack'
import { summarizeMileage } from '@/features/mileage/lib/summary'

export default function MileageProgressCard({
  period,
}: {
  period: MileagePeriod
}) {
  const { tracksMileage } = usePublisher()
  return tracksMileage ? <MileageCardContent period={period} /> : null
}

function MileageCardContent({ period }: { period: MileagePeriod }) {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const navigation = useNavigation<RootStackNavigation>()
  const entries = useMileage((state) => state.entries)
  const unit = useMileageUnit()
  const summary = summarizeMileage(entries, period)
  const total = formatMileageDistance(summary.meters, unit, _i18n.locale)
  const amount = total.slice(0, total.lastIndexOf(' '))
  const periodLabel =
    period.kind === 'month'
      ? moment([period.year, period.month, 1]).format('MMMM YYYY')
      : period.kind === 'year'
        ? i18n.t('mileage.dashboard.serviceYearRange', {
            start: period.startYear,
            end: period.startYear + 1,
          })
        : i18n.t('allTime')
  const vehicleCount = summary.vehicles.length
  const vehicleLabel = vehicleCount
    ? i18n.t(
        vehicleCount === 1
          ? 'mileage.progressCard.vehicles.one'
          : 'mileage.progressCard.vehicles.other',
        { count: vehicleCount }
      )
    : undefined
  const pendingCount = entries.filter(
    (entry) => entry.status === 'inProgress'
  ).length
  const pendingLabel = pendingCount
    ? i18n.t(
        pendingCount === 1
          ? 'mileage.progressCard.pendingTrips.one'
          : 'mileage.progressCard.pendingTrips.other',
        { count: pendingCount }
      )
    : undefined

  return (
    <Button
      accessibilityRole='button'
      accessibilityLabel={[
        i18n.t('mileage.dashboard.mileage'),
        total,
        periodLabel,
        vehicleLabel,
        pendingLabel,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={i18n.t('mileage.progressCard.openHint')}
      onPress={() => navigation.navigate('Mileage', { period })}
      style={[cardStyle, { padding: 20, gap: 12 }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <LucideIcon icon={Car} size={18} color={theme.colors.textAlt} />
        <Text
          style={{
            flex: 1,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('md'),
          }}
        >
          {i18n.t('mileage.dashboard.mileage')}
        </Text>
        <LucideIcon
          icon={ChevronRight}
          size={18}
          color={theme.colors.textAlt}
        />
      </View>
      <View style={{ gap: 4 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              fontSize: 36,
              fontFamily: theme.fonts.bold,
              flexShrink: 1,
              fontVariant: ['tabular-nums'],
            }}
          >
            {amount}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('md'),
              color: theme.colors.textAlt,
              fontFamily: theme.fonts.medium,
            }}
          >
            {unit}
          </Text>
        </View>
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {[periodLabel, vehicleLabel].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {pendingLabel && (
        <Text
          style={{ fontSize: theme.fontSize('sm'), color: theme.colors.accent }}
        >
          {pendingLabel}
        </Text>
      )}
    </Button>
  )
}
