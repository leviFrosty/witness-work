import moment from 'moment'
import { useState } from 'react'
import { ChevronRight as ChevronRightIcon } from 'lucide-react-native'

import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { AUXILIARY_REDUCED_GOAL_HOURS } from '@/lib/monthStatus'
import { usePreferences } from '@/stores/preferences'
import usePublisher from '@/hooks/usePublisher'
import AuxiliaryMonthSheet from '@/features/service-reports/components/AuxiliaryMonthSheet'
import useAuxiliaryMonths, {
  type AuxiliaryMonthSource,
} from '@/features/service-reports/hooks/useAuxiliaryMonths'

/**
 * Entry point for a Kingdom Publisher's one-month auxiliary pioneering. Renders
 * only when the standing role reports by checkbox; everyone else changes a
 * month's status from the Progress tab.
 */
const AuxiliaryMonthRow = ({
  source,
  variant = 'inline',
}: {
  source: AuxiliaryMonthSource
  /** `inline` sits in a card (Home); `row` fills a settings Section. */
  variant?: 'inline' | 'row'
}) => {
  const theme = useTheme()
  const { entryMode } = usePublisher('standing')
  const { publisherHours } = usePreferences()
  const { months } = useAuxiliaryMonths()
  const [open, setOpen] = useState(false)
  if (entryMode !== 'checkbox') return null

  const [thisMonth, nextMonth] = months
  const goalHours = (status: string) =>
    status === 'regularAuxiliaryReduced'
      ? AUXILIARY_REDUCED_GOAL_HOURS
      : publisherHours.regularAuxiliary

  const state = thisMonth.isAuxiliary
    ? 'this_month'
    : nextMonth.isAuxiliary
      ? 'next_month'
      : 'none'
  const label =
    state === 'this_month'
      ? i18n.t('auxiliaryMonth.activeThisMonth', {
          count: goalHours(thisMonth.status),
        })
      : state === 'next_month'
        ? i18n.t('auxiliaryMonth.scheduled', {
            month: moment(nextMonth.target).format('MMMM'),
          })
        : i18n.t('auxiliaryMonth.prompt')
  const active = state !== 'none'

  return (
    <>
      <Button
        noTransform
        accessibilityRole='button'
        accessibilityLabel={label}
        onPress={() => {
          analytics.capture('auxiliary_month_sheet_viewed', { source, state })
          setOpen(true)
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          minHeight: 44,
          ...(variant === 'row'
            ? { paddingHorizontal: 20, paddingVertical: 12 }
            : {
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: active ? theme.colors.accent : theme.colors.border,
                borderRadius: theme.numbers.borderRadiusMd,
                backgroundColor: active
                  ? theme.colors.accentTranslucent
                  : 'transparent',
              }),
        }}
      >
        <Text
          style={{
            flex: 1,
            color: active ? theme.colors.accent : theme.colors.text,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize(variant === 'row' ? 'md' : 'sm'),
          }}
        >
          {label}
        </Text>
        <LucideIcon
          icon={ChevronRightIcon}
          size={16}
          color={active ? theme.colors.accent : theme.colors.textAlt}
        />
      </Button>
      <AuxiliaryMonthSheet open={open} onOpenChange={setOpen} source={source} />
    </>
  )
}

export default AuxiliaryMonthRow
