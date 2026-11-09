import { Fragment } from 'react'
import { ScrollView, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Card from '@/components/ui/Card'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import Wrapper from '@/components/ui/layout/Wrapper'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { entriesById, isChecked } from '@/lib/routine/habits'
import { habitLabel } from '@/lib/routine/labels'
import type { RootStackNavigation } from '@/types/rootStack'
import { monthCountLabel } from '@/features/routine/components/RoutineHabitHistory'
import RoutineHabitRow from '@/features/routine/components/RoutineHabitRow'
import useRoutineToday from '@/features/routine/hooks/useRoutineToday'
import { toggleHabit } from '@/features/routine/lib/checkHabit'
import { openHabit } from '@/features/routine/lib/openHabit'

export default function RoutineScreen() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { today, settings, entries, worshipKind } = useRoutineToday()
  const byId = entriesById(entries)

  return (
    <Wrapper insets='bottom'>
      <ScrollView testID='routine-screen'>
        <ContentColumn style={{ padding: 16, paddingBottom: 48, gap: 16 }}>
          {settings.habits.length === 0 ? (
            <Text style={{ color: theme.colors.textAlt, textAlign: 'center' }}>
              {i18n.t('routine.screen.noHabits')}
            </Text>
          ) : (
            <Card
              style={{
                paddingHorizontal: 0,
                paddingVertical: 6,
                gap: 0,
                overflow: 'hidden',
              }}
            >
              {settings.habits.map((habit, index) => {
                const done = isChecked(byId, habit, today)
                return (
                  <Fragment key={habit}>
                    {index > 0 ? (
                      <View
                        style={{
                          height: 1,
                          marginStart: 68,
                          backgroundColor: theme.colors.border,
                        }}
                      />
                    ) : null}
                    <RoutineHabitRow
                      habit={habit}
                      testID={`routine-card-${habit}`}
                      label={habitLabel(habit, worshipKind)}
                      detail={monthCountLabel(habit, entries, today)}
                      done={done}
                      onOpen={() => openHabit(navigation, habit, 'routine')}
                      onToggle={() =>
                        toggleHabit({ habit, day: today, today, done })
                      }
                    />
                  </Fragment>
                )
              })}
            </Card>
          )}
        </ContentColumn>
      </ScrollView>
    </Wrapper>
  )
}
