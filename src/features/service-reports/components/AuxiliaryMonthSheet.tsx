import moment from 'moment'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Sheet } from 'tamagui'

import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { AUXILIARY_REDUCED_GOAL_HOURS } from '@/lib/monthStatus'
import { usePreferences } from '@/stores/preferences'
import useAuxiliaryMonths, {
  type AuxiliaryGoal,
  type AuxiliaryMonthSource,
} from '@/features/service-reports/hooks/useAuxiliaryMonths'

type MonthKey = 'this' | 'next'

export interface AuxiliaryMonthSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  source: AuxiliaryMonthSource
}

/**
 * One-month auxiliary pioneering for a Kingdom Publisher: pick this month or
 * next and a 30h or 15h goal. That month then tracks hours (Add Time, Progress
 * tab, hours Service Report) and returns to the standing role afterwards.
 */
const AuxiliaryMonthSheet = ({
  open,
  onOpenChange,
  source,
}: AuxiliaryMonthSheetProps) => {
  const theme = useTheme()
  const { publisherHours } = usePreferences()
  const { months, setAuxiliary } = useAuxiliaryMonths()
  const [thisMonth, nextMonth] = months

  const [monthKey, setMonthKey] = useState<MonthKey>('this')
  const selected = monthKey === 'this' ? thisMonth : nextMonth
  const [goal, setGoal] = useState<AuxiliaryGoal>('regularAuxiliary')

  // Open on whichever month is already auxiliary, else this month.
  const initialMonthKey: MonthKey =
    !thisMonth.isAuxiliary && nextMonth.isAuxiliary ? 'next' : 'this'
  useEffect(() => {
    if (open) setMonthKey(initialMonthKey)
  }, [open, initialMonthKey])

  useEffect(() => {
    setGoal(
      selected.status === 'regularAuxiliaryReduced'
        ? 'regularAuxiliaryReduced'
        : 'regularAuxiliary'
    )
  }, [selected.status, monthKey])

  const monthName = moment(selected.target).format('MMMM')

  const handleSave = () => {
    setAuxiliary(selected, goal, source)
    onOpenChange(false)
  }

  const handleEnd = () => {
    setAuxiliary(selected, null, source)
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      dismissOnSnapToBottom
      modal
      snapPoints={[selected.isAuxiliary ? 56 : 48]}
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame backgroundColor={theme.colors.background}>
        <View
          style={{
            paddingHorizontal: inputLayout.horizontalPadding * 2,
            width: '100%',
            maxWidth: inputLayout.contentMaxWidth,
            alignSelf: 'center',
            paddingTop: 22,
            paddingBottom: 32,
            gap: 20,
          }}
        >
          <View style={{ gap: 6 }}>
            <Text
              accessibilityRole='header'
              style={{
                color: theme.colors.text,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('xl'),
              }}
            >
              {i18n.t('auxiliaryMonth.title')}
            </Text>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {i18n.t('auxiliaryMonth.description')}
            </Text>
          </View>

          <SegmentedControl<MonthKey>
            variant='pill'
            value={monthKey}
            onChange={setMonthKey}
            options={[
              {
                key: 'this',
                label: moment(thisMonth.target).format('MMMM'),
              },
              {
                key: 'next',
                label: moment(nextMonth.target).format('MMMM'),
              },
            ]}
          />

          <SegmentedControl<AuxiliaryGoal>
            variant='pill'
            value={goal}
            onChange={setGoal}
            options={[
              {
                key: 'regularAuxiliary',
                label: i18n.t('auxiliaryMonth.goalHours', {
                  count: publisherHours.regularAuxiliary,
                }),
              },
              {
                key: 'regularAuxiliaryReduced',
                label: i18n.t('auxiliaryMonth.goalHours', {
                  count: AUXILIARY_REDUCED_GOAL_HOURS,
                }),
              },
            ]}
          />

          <ActionButton
            noTransform
            accessibilityRole='button'
            onPress={handleSave}
          >
            {selected.isAuxiliary
              ? i18n.t('save')
              : i18n.t('auxiliaryMonth.start', { month: monthName })}
          </ActionButton>

          {selected.isAuxiliary ? (
            <Button
              noTransform
              accessibilityRole='button'
              onPress={handleEnd}
              style={{ alignSelf: 'center', paddingVertical: 4 }}
            >
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {i18n.t('auxiliaryMonth.end', { month: monthName })}
              </Text>
            </Button>
          ) : null}
        </View>
      </Sheet.Frame>
    </Sheet>
  )
}

export default AuxiliaryMonthSheet
