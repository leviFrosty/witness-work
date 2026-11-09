import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import {
  BookOpenCheck as BookOpenCheckIcon,
  CircleCheck as CircleCheckIcon,
} from 'lucide-react-native'
import HomeSectionMenu from '@/components/HomeSectionMenu'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { allDone } from '@/lib/routine/habits'
import { habitLabel } from '@/lib/routine/labels'
import type { RootStackNavigation } from '@/types/rootStack'
import RoutineHabitRow from '@/features/routine/components/RoutineHabitRow'
import useRoutineToday from '@/features/routine/hooks/useRoutineToday'
import { toggleHabit } from '@/features/routine/lib/checkHabit'
import { itemDetail } from '@/features/routine/lib/itemDetail'
import { openHabit } from '@/features/routine/lib/openHabit'
import { flushRoutineDayLog } from '@/features/routine/stores/routineDayLog'

export default function RoutineHomeSection() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const routine = useRoutineToday()
  const { today, items } = routine
  const [expandedOn, setExpandedOn] = useState<string | null>(null)

  useEffect(() => {
    flushRoutineDayLog(today)
  }, [today])

  const finished = allDone(items)
  const collapsed = finished && expandedOn !== today
  const openRoutine = () => navigation.navigate('Routine')

  return (
    <Card
      style={{
        paddingHorizontal: 0,
        paddingVertical: 0,
        gap: 0,
        overflow: 'hidden',
      }}
    >
      <HomeSectionMenu
        accessibilityLabel={i18n.t('routine.title')}
        onPress={openRoutine}
        actions={[
          [
            {
              id: 'routine_settings',
              title: i18n.t('routine.home.settings'),
              systemImage: 'gearshape',
              onPress: () => navigation.navigate('RoutineSettings'),
            },
          ],
        ]}
      >
        <View
          style={{
            minHeight: 48,
            paddingHorizontal: 20,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.accentTranslucent,
              }}
            >
              <LucideIcon
                icon={BookOpenCheckIcon}
                size={18}
                color={theme.colors.accent}
              />
            </View>
            <Text
              style={{
                fontSize: theme.fontSize('lg'),
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('routine.homeTitle')}
            </Text>
          </View>
          <LucideIcon
            icon={ChevronForwardIcon}
            size={16}
            color={theme.colors.textAlt}
          />
        </View>
      </HomeSectionMenu>
      <View
        style={{
          paddingVertical: 6,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        }}
      >
        {collapsed || items.length === 0 ? (
          <Button
            onPress={() => (collapsed ? setExpandedOn(today) : openRoutine())}
            accessibilityRole='button'
            accessibilityHint={
              collapsed ? i18n.t('routine.home.allDoneHint') : undefined
            }
            style={{
              minHeight: MIN_TOUCH_TARGET + 8,
              paddingHorizontal: 20,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
            testID='routine-all-done'
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: collapsed
                  ? theme.colors.accentTranslucent
                  : theme.colors.backgroundLighter,
              }}
            >
              <LucideIcon
                icon={CircleCheckIcon}
                size={18}
                color={collapsed ? theme.colors.accent : theme.colors.textAlt}
              />
            </View>
            <Text
              style={{
                fontSize: theme.fontSize('md'),
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t(
                collapsed ? 'routine.home.allDone' : 'routine.home.nothingToday'
              )}
            </Text>
          </Button>
        ) : (
          items.map(({ habit, done }) => (
            <RoutineHabitRow
              key={habit}
              habit={habit}
              testID={`routine-habit-${habit}`}
              label={habitLabel(habit, routine.worshipKind)}
              detail={itemDetail({
                habit,
                done,
                settings: routine.settings,
                entries: routine.entries,
                today,
                studies: routine.studiesThisWeek,
                plan: routine.plan,
              })}
              done={done}
              onOpen={() => openHabit(navigation, habit, 'home')}
              onToggle={() => toggleHabit({ habit, day: today, today, done })}
            />
          ))
        )}
      </View>
    </Card>
  )
}
