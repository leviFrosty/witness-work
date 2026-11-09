import { View } from 'react-native'
import SimpleProgressBar from '@/components/ui/SimpleProgressBar'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { portionLabel } from '@/lib/routine/labels'
import type { RoutineEntry } from '@/types/routine'
import RoutineHabitRow from '@/features/routine/components/RoutineHabitRow'
import RoutineOutlineButton from '@/features/routine/components/RoutineOutlineButton'
import type { ActivePlan } from '@/features/routine/hooks/useRoutineToday'
import { planName } from '@/features/routine/lib/applyPlanChoice'
import { planAgenda, type AgendaRow } from '@/features/routine/lib/planAgenda'

const caption = (row: AgendaRow, readSomeToday: boolean): string => {
  if (row.readToday) return i18n.t('routine.screen.readToday')
  if (!row.isNext)
    return i18n.t('routine.screen.planDayNumber', {
      day: row.portion.index + 1,
    })
  return i18n.t(
    readSomeToday ? 'routine.screen.upNext' : 'routine.screen.todaysReading'
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
  onUnread: (portion: number) => void
  onChoosePlan: () => void
}) {
  const theme = useTheme()
  const { run, progress } = plan
  const rows = planAgenda(run, entries, today)
  const readSomeToday = rows.some((row) => row.readToday)
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
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
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
      <View style={{ paddingVertical: 8 }}>
        {rows.map((row) => (
          <RoutineHabitRow
            key={row.portion.index}
            testID={`routine-portion-${row.portion.index}`}
            caption={caption(row, readSomeToday)}
            label={portionLabel(row.portion)}
            done={row.readToday}
            onToggle={() =>
              row.readToday
                ? onUnread(row.portion.index)
                : onRead(row.portion.index)
            }
          />
        ))}
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
        <RoutineOutlineButton
          label={i18n.t('routine.screen.changePlan')}
          onPress={onChoosePlan}
          testID='routine-change-plan'
        />
      </View>
    </View>
  )
}
