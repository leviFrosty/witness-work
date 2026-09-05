import { View } from 'react-native'
import moment from 'moment'
import { ChevronRight } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { useCardStyle } from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import Badge from '@/components/ui/Badge'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type {
  MileageCategory,
  MileageEntry,
  MileageVehicle,
} from '@/types/mileage'
import {
  mileageCategoryLabel,
  mileageVehicleLabel,
} from '@/features/mileage/lib/summary'

export function MileageTotalRow({
  label,
  meters,
  formatDistance,
  onPress,
}: {
  label: string
  meters: number
  formatDistance: (meters: number) => string
  onPress: () => void
}) {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  return (
    <Button
      onPress={onPress}
      style={[
        cardStyle,
        {
          paddingHorizontal: 15,
          paddingVertical: 14,
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: 12,
        },
      ]}
    >
      <Text style={{ flex: 1, fontFamily: theme.fonts.medium }}>{label}</Text>
      <Text style={{ fontFamily: theme.fonts.semiBold }}>
        {formatDistance(meters)}
      </Text>
      <LucideIcon icon={ChevronRight} size={15} color={theme.colors.textAlt} />
    </Button>
  )
}

export default function MileageHistoryRows({
  entries,
  vehicles,
  categories,
  formatDistance,
  onEdit,
}: {
  entries: MileageEntry[]
  vehicles: MileageVehicle[]
  categories: MileageCategory[]
  formatDistance: (meters: number) => string
  onEdit: (id: string) => void
}) {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  return (
    <View style={{ gap: 10 }}>
      {entries.length === 0 && (
        <Text
          style={{
            textAlign: 'center',
            color: theme.colors.textAlt,
            paddingVertical: 24,
          }}
        >
          {i18n.t('mileage.dashboard.noEntries')}
        </Text>
      )}
      {entries.map((entry) => (
        <Button
          key={entry.id}
          onPress={() => onEdit(entry.id)}
          style={[cardStyle, { padding: 15, alignItems: 'stretch', gap: 8 }]}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              {moment(entry.date, 'YYYY-MM-DD', true).format('ll')}
            </Text>
            {entry.status === 'inProgress' ? (
              <Badge size='xs'>{i18n.t('mileage.dashboard.inProgress')}</Badge>
            ) : (
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.accent,
                }}
              >
                {formatDistance(entry.distanceMeters ?? 0)}
              </Text>
            )}
          </View>
          <Text style={{ color: theme.colors.textAlt }}>
            {mileageVehicleLabel(
              vehicles,
              entry.vehicleId,
              i18n.t('mileage.dashboard.unknownVehicle')
            )}
          </Text>
          {entry.categoryId && (
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {mileageCategoryLabel(
                categories,
                entry.categoryId,
                i18n.t('mileage.dashboard.uncategorized'),
                i18n.t('mileage.dashboard.unknownCategory')
              )}
            </Text>
          )}
          {entry.note && (
            <Text
              numberOfLines={2}
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {entry.note}
            </Text>
          )}
        </Button>
      ))}
    </View>
  )
}
