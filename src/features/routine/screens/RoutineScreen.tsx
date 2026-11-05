import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import Wrapper from '@/components/ui/layout/Wrapper'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { habitLabel } from '@/lib/routine/labels'
import ReadingPlanBlock from '@/features/routine/components/ReadingPlanBlock'
import ReadingPlanSheet from '@/features/routine/components/ReadingPlanSheet'
import RoutineHabitCard from '@/features/routine/components/RoutineHabitCard'
import useRoutineToday from '@/features/routine/hooks/useRoutineToday'
import { readNextPortion, toggleHabit } from '@/features/routine/lib/checkHabit'

export default function RoutineScreen() {
  const theme = useTheme()
  const { today, settings, entries, worshipKind, plan } = useRoutineToday()
  const [planSheetOpen, setPlanSheetOpen] = useState(false)

  return (
    <Wrapper insets='bottom'>
      <ScrollView testID='routine-screen'>
        <ContentColumn style={{ padding: 16, paddingBottom: 48, gap: 16 }}>
          {settings.habits.length === 0 ? (
            <Text style={{ color: theme.colors.textAlt, textAlign: 'center' }}>
              {i18n.t('routine.screen.noHabits')}
            </Text>
          ) : null}
          {settings.habits.map((habit) => {
            const label = habitLabel(habit, worshipKind)
            return (
              <RoutineHabitCard
                key={habit}
                habit={habit}
                label={label}
                entries={entries}
                today={today}
                onToggle={(day, done) =>
                  toggleHabit({ habit, day, today, done })
                }
              >
                {habit === 'bibleReading' ? (
                  <View>
                    <ReadingPlanBlock
                      plan={plan}
                      entries={entries}
                      today={today}
                      onRead={() =>
                        toggleHabit({ habit, day: today, today, done: false })
                      }
                      onReadNext={() => readNextPortion(today)}
                      onChoosePlan={() => setPlanSheetOpen(true)}
                    />
                  </View>
                ) : null}
              </RoutineHabitCard>
            )
          })}
        </ContentColumn>
      </ScrollView>
      <ReadingPlanSheet
        open={planSheetOpen}
        onClose={() => setPlanSheetOpen(false)}
      />
    </Wrapper>
  )
}
