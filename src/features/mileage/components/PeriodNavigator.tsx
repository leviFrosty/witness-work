import { View } from 'react-native'
import {
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as ArrowRightIcon,
} from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import SegmentedControl from '@/components/ui/SegmentedControl'
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

/** Day / Week / Month / Year selector with previous/next arrows. */
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
          style={navButton}
          accessibilityLabel={i18n.t('mileage.previousPeriod')}
        >
          <IconButton icon={ArrowLeftIcon} size={15} />
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
          style={navButton}
          accessibilityLabel={i18n.t('mileage.nextPeriod')}
        >
          <IconButton icon={ArrowRightIcon} size={15} />
        </Button>
      </View>
    </View>
  )
}
