import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import Card from '@/components/ui/Card'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import Wrapper from '@/components/ui/layout/Wrapper'
import i18n from '@/lib/locales'
import { entriesById, isChecked } from '@/lib/routine/habits'
import { habitLabel } from '@/lib/routine/labels'
import type { RootStackParamList } from '@/types/rootStack'
import { isRoutineHabit, isWeeklyHabit } from '@/types/routine'
import ReadingPlanBlock from '@/features/routine/components/ReadingPlanBlock'
import ReadingPlanSheet from '@/features/routine/components/ReadingPlanSheet'
import RoutineHabitHistory from '@/features/routine/components/RoutineHabitHistory'
import RoutineHabitRow from '@/features/routine/components/RoutineHabitRow'
import RoutineOutlineButton from '@/features/routine/components/RoutineOutlineButton'
import useRoutineToday from '@/features/routine/hooks/useRoutineToday'
import {
  markPortionRead,
  toggleHabit,
  unmarkPortionRead,
} from '@/features/routine/lib/checkHabit'
import { itemDetail } from '@/features/routine/lib/itemDetail'

type Props = NativeStackScreenProps<RootStackParamList, 'RoutineHabit'>

export default function RoutineHabitScreen({ route }: Props) {
  const routine = useRoutineToday()
  const { today, settings, entries, plan } = routine
  const [planSheetOpen, setPlanSheetOpen] = useState(false)
  const habit = route.params?.habit
  if (!isRoutineHabit(habit)) return null

  const label = habitLabel(habit, routine.worshipKind)
  const done = isChecked(entriesById(entries), habit, today)
  const reading = habit === 'bibleReading'

  return (
    <Wrapper insets='bottom'>
      <ScrollView testID={`routine-habit-screen-${habit}`}>
        <ContentColumn style={{ padding: 16, paddingBottom: 48, gap: 16 }}>
          <Card style={{ paddingHorizontal: 0, paddingVertical: 0, gap: 0 }}>
            {reading && plan ? (
              <ReadingPlanBlock
                plan={plan}
                entries={entries}
                today={today}
                onRead={(portion) => markPortionRead(today, portion)}
                onUnread={(portion, day) => unmarkPortionRead(day, portion)}
                onChoosePlan={() => setPlanSheetOpen(true)}
              />
            ) : (
              <View style={{ paddingVertical: 8 }}>
                <RoutineHabitRow
                  testID='routine-habit-today'
                  label={i18n.t(
                    isWeeklyHabit(habit) ? 'routine.screen.thisWeek' : 'today'
                  )}
                  detail={itemDetail({
                    habit,
                    done,
                    settings,
                    entries,
                    today,
                    studies: routine.studiesThisWeek,
                    plan,
                  })}
                  done={done}
                  onToggle={() =>
                    toggleHabit({ habit, day: today, today, done })
                  }
                />
                {reading ? (
                  <View
                    style={{
                      paddingHorizontal: 20,
                      paddingTop: 8,
                      paddingBottom: 12,
                    }}
                  >
                    <RoutineOutlineButton
                      label={i18n.t('routine.screen.startPlan')}
                      onPress={() => setPlanSheetOpen(true)}
                      testID='routine-start-plan'
                    />
                  </View>
                ) : null}
              </View>
            )}
          </Card>
          <RoutineHabitHistory
            habit={habit}
            label={label}
            entries={entries}
            today={today}
            onToggle={(day, isDone) =>
              toggleHabit({ habit, day, today, done: isDone })
            }
          />
        </ContentColumn>
      </ScrollView>
      {reading ? (
        <ReadingPlanSheet
          open={planSheetOpen}
          onClose={() => setPlanSheetOpen(false)}
        />
      ) : null}
    </Wrapper>
  )
}
