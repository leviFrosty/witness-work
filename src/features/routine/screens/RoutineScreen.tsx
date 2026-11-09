import { Fragment } from 'react'
import { ScrollView, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import ContributionGraph from '@/components/ContributionGraph'
import Card from '@/components/ui/Card'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import Wrapper from '@/components/ui/layout/Wrapper'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { entriesById, isChecked } from '@/lib/routine/habits'
import { habitLabel } from '@/lib/routine/labels'
import type { RootStackNavigation } from '@/types/rootStack'
import type { RoutineEntry, RoutineHabit } from '@/types/routine'
import { monthCountLabel } from '@/features/routine/components/RoutineHabitHistory'
import RoutineHabitRow from '@/features/routine/components/RoutineHabitRow'
import useRoutineToday from '@/features/routine/hooks/useRoutineToday'
import { toggleHabit } from '@/features/routine/lib/checkHabit'
import { openHabit } from '@/features/routine/lib/openHabit'

export const checksByDay = (
  entries: readonly RoutineEntry[],
  habits: readonly RoutineHabit[]
): Map<string, number> => {
  const daily = new Map<string, number>()
  for (const entry of entries)
    if (habits.includes(entry.habit))
      daily.set(entry.on, (daily.get(entry.on) ?? 0) + 1)
  return daily
}

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
            <>
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
              <Card style={{ gap: 14 }}>
                <Text
                  accessibilityRole='header'
                  style={{
                    fontSize: theme.fontSize('lg'),
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('routine.screen.history')}
                </Text>
                <ContributionGraph
                  daily={checksByDay(entries, settings.habits)}
                  formatValue={(count) =>
                    i18n.t('routine.screen.checkedCount', { count })
                  }
                  describe={(summary, weeks) =>
                    i18n.t('routine.screen.overviewGraphA11y', {
                      count: summary.daysWithService,
                      weeks,
                    })
                  }
                />
              </Card>
            </>
          )}
        </ContentColumn>
      </ScrollView>
    </Wrapper>
  )
}
