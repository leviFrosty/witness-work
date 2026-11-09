import { useState } from 'react'
import { View } from 'react-native'
import {
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import SimpleProgressBar from '@/components/ui/SimpleProgressBar'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { portionLabel } from '@/lib/routine/labels'
import type { RoutineEntry } from '@/types/routine'
import PlanDatesSheet from '@/features/routine/components/PlanDatesSheet'
import RoutineHabitRow from '@/features/routine/components/RoutineHabitRow'
import RoutineOutlineButton from '@/features/routine/components/RoutineOutlineButton'
import type { ActivePlan } from '@/features/routine/hooks/useRoutineToday'
import { planName } from '@/features/routine/lib/applyPlanChoice'
import {
  planAgenda,
  planCompleted,
  readPlanToday,
  type AgendaRow,
} from '@/features/routine/lib/planAgenda'
import { planPace } from '@/features/routine/lib/planPace'
import { paceLabel, planDateLabel } from '@/features/routine/lib/planPaceLabel'

const COMPLETED_PAGE = 20

const caption = (row: AgendaRow, readToday: boolean): string => {
  if (!row.isNext)
    return i18n.t('routine.screen.planDayNumber', {
      day: row.portion.index + 1,
    })
  return i18n.t(
    readToday ? 'routine.screen.upNext' : 'routine.screen.todaysReading'
  )
}

export default function ReadingPlanBlock({
  plan,
  entries,
  today,
  onRead,
  onUnread,
  onChoosePlan,
}: {
  plan: ActivePlan
  entries: readonly RoutineEntry[]
  today: string
  onRead: (portion: number) => void
  onUnread: (portion: number, day: string) => void
  onChoosePlan: () => void
}) {
  const theme = useTheme()
  const [datesOpen, setDatesOpen] = useState(false)
  const [completedOpen, setCompletedOpen] = useState(false)
  const [completedShown, setCompletedShown] = useState(COMPLETED_PAGE)
  const { run, progress } = plan
  const rows = planAgenda(run, entries)
  const completed = planCompleted(run, entries)
  const readToday = readPlanToday(run, entries, today)
  const small = { fontSize: theme.fontSize('sm'), color: theme.colors.textAlt }
  const dates = run.finishBy
    ? i18n.t('routine.screen.planStartedFinishBy', {
        date: planDateLabel(run.startedOn),
        finish: planDateLabel(run.finishBy),
      })
    : i18n.t('routine.screen.planStarted', {
        date: planDateLabel(run.startedOn),
      })
  const pace = paceLabel(planPace(run, progress, today, readToday))
  return (
    <View testID='routine-plan'>
      <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 8,
          }}
        >
          <Text
            accessibilityRole='header'
            style={{
              flexShrink: 1,
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {planName(run.kind)}
          </Text>
          <Text style={small}>
            {i18n.t('routine.screen.planRead', {
              read: progress.read,
              total: progress.total,
            })}
          </Text>
        </View>
        <SimpleProgressBar
          percentage={progress.total ? progress.read / progress.total : 0}
          color={theme.colors.accent}
          height={8}
          animated={false}
        />
      </View>
      <Button
        accessibilityRole='button'
        accessibilityLabel={[dates, pace].filter(Boolean).join(', ')}
        accessibilityHint={i18n.t('routine.dates.title')}
        onPress={() => setDatesOpen(true)}
        testID='routine-plan-dates'
        style={{
          minHeight: MIN_TOUCH_TARGET,
          paddingHorizontal: 20,
          paddingVertical: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: theme.fontSize('sm') }}>{dates}</Text>
          {pace ? <Text style={small}>{pace}</Text> : null}
        </View>
        <LucideIcon
          icon={ChevronForwardIcon}
          size={18}
          color={theme.colors.textAlt}
        />
      </Button>
      <View style={{ paddingBottom: 8 }}>
        {rows.map((row) => (
          <RoutineHabitRow
            key={row.portion.index}
            testID={`routine-portion-${row.portion.index}`}
            caption={caption(row, readToday)}
            label={portionLabel(row.portion)}
            done={false}
            onToggle={() => onRead(row.portion.index)}
          />
        ))}
        {completed.length > 0 ? (
          <Button
            accessibilityRole='button'
            accessibilityState={{ expanded: completedOpen }}
            accessibilityLabel={`${i18n.t('completed')}, ${completed.length}`}
            onPress={() => {
              setCompletedOpen(!completedOpen)
              setCompletedShown(COMPLETED_PAGE)
            }}
            testID='routine-plan-completed'
            style={{
              minHeight: MIN_TOUCH_TARGET + 8,
              paddingHorizontal: 20,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: theme.fontSize('md'),
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('completed')}
            </Text>
            <Text style={small}>{completed.length}</Text>
            <LucideIcon
              icon={completedOpen ? ChevronUpIcon : ChevronDownIcon}
              size={20}
              color={theme.colors.textAlt}
            />
          </Button>
        ) : null}
        {completedOpen
          ? completed
              .slice(0, completedShown)
              .map((row) => (
                <RoutineHabitRow
                  key={row.portion.index}
                  testID={`routine-completed-${row.portion.index}`}
                  caption={
                    row.on === today
                      ? i18n.t('routine.screen.readToday')
                      : planDateLabel(row.on)
                  }
                  label={portionLabel(row.portion)}
                  done
                  onToggle={() => onUnread(row.portion.index, row.on)}
                />
              ))
          : null}
        {completedOpen && completed.length > completedShown ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            <RoutineOutlineButton
              label={i18n.t('routine.screen.showEarlier')}
              onPress={() => setCompletedShown(completedShown + COMPLETED_PAGE)}
              testID='routine-completed-more'
            />
          </View>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
        <RoutineOutlineButton
          label={i18n.t('routine.screen.changePlan')}
          onPress={onChoosePlan}
          testID='routine-change-plan'
        />
      </View>
      <PlanDatesSheet
        open={datesOpen}
        onClose={() => setDatesOpen(false)}
        plan={plan}
        today={today}
        readToday={readToday}
      />
    </View>
  )
}
