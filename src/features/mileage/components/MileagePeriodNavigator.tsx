import { View } from 'react-native'
import { ArrowLeft, ArrowRight } from 'lucide-react-native'
import moment from 'moment'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import Badge from '@/components/ui/Badge'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { MileagePeriod } from '@/features/mileage/lib/summary'

export default function MileagePeriodNavigator({
  period,
  onChange,
}: {
  period: MileagePeriod
  onChange: (period: MileagePeriod) => void
}) {
  const theme = useTheme()
  if (period.kind === 'allTime') return null
  const now = moment()
  const currentStartYear = now.month() < 8 ? now.year() - 1 : now.year()
  const date =
    period.kind === 'month' ? moment([period.year, period.month, 1]) : null
  const current = date
    ? date.isSame(now, 'month')
    : period.kind === 'year' && period.startYear === currentStartYear
  const title = date
    ? date.format('MMMM YYYY')
    : period.kind === 'year'
      ? `${period.startYear}–${period.startYear + 1}`
      : ''
  const navigate = (step: number) => {
    if (period.kind === 'year')
      onChange({ ...period, startYear: period.startYear + step })
    else if (date) {
      const next = date.clone().add(step, 'month')
      onChange({ kind: 'month', month: next.month(), year: next.year() })
    }
  }
  const buttonStyle = {
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.numbers.borderRadiusLg,
    paddingHorizontal: 15,
    paddingVertical: 8,
  }
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <Button
        onPress={() => navigate(-1)}
        accessibilityLabel={i18n.t('mileage.dashboard.previousPeriod')}
        style={buttonStyle}
      >
        <IconButton icon={ArrowLeft} size={15} />
      </Button>
      <View style={{ alignItems: 'center', gap: 4, flex: 1 }}>
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {title}
        </Text>
        {!current && (
          <Button
            onPress={() =>
              onChange(
                period.kind === 'month'
                  ? { kind: 'month', month: now.month(), year: now.year() }
                  : { kind: 'year', startYear: currentStartYear }
              )
            }
          >
            <Badge size='xs'>{i18n.t('today')}</Badge>
          </Button>
        )}
      </View>
      <Button
        onPress={() => navigate(1)}
        accessibilityLabel={i18n.t('mileage.dashboard.nextPeriod')}
        style={buttonStyle}
      >
        <IconButton icon={ArrowRight} size={15} />
      </Button>
    </View>
  )
}
