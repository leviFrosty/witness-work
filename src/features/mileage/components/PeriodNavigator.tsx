import { View } from 'react-native'
import {
  ArrowBackwardIcon,
  ArrowForwardIcon,
} from '@/components/ui/DirectionalIcon'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { touchTargetFrame } from '@/components/ui/touchTarget'
import type { MileagePeriod } from '@/lib/mileage/calc'
import { formatPeriodLabel } from '@/features/mileage/lib/format'
import type { MileagePeriodKind } from '@/types/mileage'

type Props = {
  period: MileagePeriod
  isCurrent: boolean
  onChangeKind: (kind: MileagePeriodKind) => void
  onShift: (delta: number) => void
  onToday: () => void
}

export default function PeriodNavigator({
  period,
  isCurrent,
  onChangeKind,
  onShift,
  onToday,
}: Props) {
  const theme = useTheme()
  const navButton = {
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.numbers.borderRadiusLg,
    paddingHorizontal: 15,
    paddingVertical: 8,
  }

  const navFrame = [
    touchTargetFrame(15 + 2 * 15 + 2, 15 + 2 * 8 + 2),
    { borderRadius: theme.numbers.borderRadiusLg },
  ]

  return (
    <View style={{ gap: 12 }}>
      <SegmentedControl<MileagePeriodKind>
        value={period.kind}
        onChange={onChangeKind}
        options={[
          { key: 'day', label: i18n.t('mileage.period.day') },
          { key: 'week', label: i18n.t('mileage.period.week') },
          { key: 'month', label: i18n.t('month') },
          { key: 'year', label: i18n.t('year') },
        ]}
      />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <Button
          onPress={() => onShift(-1)}
          style={navFrame}
          accessibilityLabel={i18n.t('mileage.previousPeriod')}
        >
          <View style={navButton}>
            <IconButton icon={ArrowBackwardIcon} size={15} />
          </View>
        </Button>
        <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <Text
            style={{
              fontSize: theme.fontSize('md'),
              fontFamily: theme.fonts.semiBold,
              textAlign: 'center',
            }}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatPeriodLabel(period)}
          </Text>
          {!isCurrent && (
            <Button onPress={onToday} accessibilityLabel={i18n.t('today')}>
              <Badge size='xs'>{i18n.t('today')}</Badge>
            </Button>
          )}
        </View>
        <Button
          onPress={() => onShift(1)}
          style={navFrame}
          accessibilityLabel={i18n.t('mileage.nextPeriod')}
        >
          <View style={navButton}>
            <IconButton icon={ArrowForwardIcon} size={15} />
          </View>
        </Button>
      </View>
    </View>
  )
}
