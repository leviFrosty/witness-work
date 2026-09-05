import { View } from 'react-native'
import { Car, Plus, ChartPie, ChevronRight } from 'lucide-react-native'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import ViewReportButton from '@/components/ViewReportButton'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export default function MileageSummaryCard({
  total,
  hasActiveVehicle,
  onAdd,
  onVehicles,
  onBreakdown,
  onReport,
}: {
  total: string
  hasActiveVehicle: boolean
  onAdd: () => void
  onVehicles: () => void
  onBreakdown: () => void
  onReport?: () => void
}) {
  const theme = useTheme()
  // The shared formatter emits a localized amount followed by a space + unit.
  const unitBoundary = total.lastIndexOf(' ')
  const amount = total.slice(0, unitBoundary)
  const unit = total.slice(unitBoundary + 1)
  return (
    <Card style={{ gap: 15 }}>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('mileage.dashboard.completedDistance')}
        </Text>
        {onReport && <ViewReportButton onPress={onReport} />}
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <Text
          adjustsFontSizeToFit
          numberOfLines={1}
          style={{
            fontSize: 64,
            lineHeight: 68,
            fontFamily: theme.fonts.bold,
            color: theme.colors.text,
            flexShrink: 1,
          }}
        >
          {amount}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('xl'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.textAlt,
          }}
        >
          {unit}
        </Text>
      </View>
      <Button
        onPress={onBreakdown}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 6,
          paddingVertical: 6,
        }}
      >
        <LucideIcon icon={ChartPie} size={14} color={theme.colors.textAlt} />
        <Text
          style={{
            color: theme.colors.textAlt,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('mileage.dashboard.categories')}
        </Text>
        <LucideIcon
          icon={ChevronRight}
          size={12}
          color={theme.colors.textAlt}
        />
      </Button>
      {!hasActiveVehicle && (
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('mileage.dashboard.setupHint')}
        </Text>
      )}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          paddingTop: 10,
          alignItems: 'flex-start',
        }}
      >
        <Button
          noTransform
          onPress={hasActiveVehicle ? onAdd : onVehicles}
          style={{
            paddingVertical: 6,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <LucideIcon
            icon={hasActiveVehicle ? Plus : Car}
            color={theme.colors.accent}
            size={hasActiveVehicle ? 11 : 16}
          />
          <Text
            style={{
              color: theme.colors.accent,
              flexShrink: 1,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t(
              hasActiveVehicle
                ? 'mileage.dashboard.addMileage'
                : 'mileage.dashboard.setupVehicle'
            )}
          </Text>
        </Button>
      </View>
    </Card>
  )
}
