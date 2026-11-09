import moment from 'moment'
import { View } from 'react-native'
import DateTimePicker from '@/components/ui/DateTimePicker'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import Section from '@/components/ui/inputs/Section'
import Text from '@/components/ui/MyText'
import Sheet from '@/components/ui/Sheet'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import { daysBetween, localDayKey } from '@/lib/dayKeys'
import i18n from '@/lib/locales'
import useRoutine from '@/stores/routine'
import type { ActivePlan } from '@/features/routine/hooks/useRoutineToday'
import { defaultFinishBy, planPace } from '@/features/routine/lib/planPace'
import { paceLabel } from '@/features/routine/lib/planPaceLabel'

const dateOf = (day: string): Date => moment(day, 'YYYY-MM-DD').toDate()

export default function PlanDatesSheet({
  open,
  onClose,
  plan,
  today,
  readToday,
}: {
  open: boolean
  onClose: () => void
  plan: ActivePlan
  today: string
  readToday: boolean
}) {
  const theme = useTheme()
  const { run, progress } = plan
  const setPlanDates = useRoutine((state) => state.setPlanDates)
  const hasFinish = !!run.finishBy

  const toggleFinish = (on: boolean) => {
    const finishBy = on
      ? defaultFinishBy(run, progress, today, readToday)
      : null
    if (!setPlanDates(run.id, { finishBy })) return
    analytics.capture('routine_plan_finish_date_set', {
      kind: run.kind,
      on,
      days_left: finishBy ? daysBetween(today, finishBy) : undefined,
    })
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <Sheet.ScrollView
        contentContainerStyle={{ padding: 20, gap: 16 }}
        testID='routine-plan-dates-sheet'
      >
        <Text
          accessibilityRole='header'
          style={{
            fontSize: theme.fontSize('xl'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('routine.dates.title')}
        </Text>
        <Section>
          <InputRowContainer label={i18n.t('routine.dates.started')}>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <DateTimePicker
                value={dateOf(run.startedOn)}
                maximumDate={dateOf(today)}
                onChange={(_event, date) => {
                  if (date)
                    setPlanDates(run.id, { startedOn: localDayKey(date) })
                }}
                iOSMode='date'
                testID='routine-plan-started'
              />
            </View>
          </InputRowContainer>
          <InputRowSwitch
            label={i18n.t('routine.dates.finishSwitch')}
            info={i18n.t('routine.dates.finishInfo')}
            value={hasFinish}
            onValueChange={toggleFinish}
            lastInSection={!hasFinish}
          />
          {run.finishBy ? (
            <InputRowContainer
              label={i18n.t('routine.dates.finishBy')}
              description={
                paceLabel(planPace(run, progress, today, readToday)) ??
                undefined
              }
              lastInSection
            >
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <DateTimePicker
                  value={dateOf(run.finishBy)}
                  minimumDate={dateOf(today)}
                  onChange={(_event, date) => {
                    if (date)
                      setPlanDates(run.id, { finishBy: localDayKey(date) })
                  }}
                  iOSMode='date'
                  testID='routine-plan-finish-by'
                />
              </View>
            </InputRowContainer>
          ) : null}
        </Section>
      </Sheet.ScrollView>
    </Sheet>
  )
}
