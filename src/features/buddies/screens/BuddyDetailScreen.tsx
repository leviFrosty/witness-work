import { useEffect } from 'react'
import { ScrollView, View } from 'react-native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { CalendarPlus as CalendarPlusIcon } from 'lucide-react-native'
import moment from 'moment'
import Button from '@/components/ui/Button'
import ContextMenu from '@/components/ui/ContextMenu'
import LucideIcon from '@/components/ui/LucideIcon'
import Section from '@/components/ui/inputs/Section'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import Wrapper from '@/components/ui/layout/Wrapper'
import useTheme from '@/contexts/theme'
import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import { RootStackParamList } from '@/types/rootStack'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import usePlanSameTime from '@/features/buddies/hooks/usePlanSameTime'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { confirmRemoveBuddy } from '@/features/buddies/lib/buddyConfirmations'
import { buddyTenureLabel } from '@/features/buddies/lib/buddyProfile'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

type Props = NativeStackScreenProps<RootStackParamList, 'Buddy'>

/**
 * One buddy: who they are, their upcoming Plans (tap one to plan the same
 * time), and ending the pairing.
 */
export default function BuddyDetailScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const { timeDisplayFormat } = usePreferences()
  const { inboxId } = route.params
  const buddy = useBuddies((state) =>
    state.buddies.find((candidate) => candidate.inboxId === inboxId)
  )
  const card = useBuddies((state) => state.cards[inboxId])
  const planSameTime = usePlanSameTime('buddy_detail')

  // Removed here, from the other side, or by delete-all.
  useEffect(() => {
    if (!buddy) navigation.goBack()
  }, [buddy, navigation])
  if (!buddy) return null

  const today = moment().format('YYYY-MM-DD')
  const upcoming = (card?.days ?? []).filter((day) => day.d >= today)

  const secondary = {
    color: theme.colors.textAlt,
    fontSize: theme.fontSize('sm'),
  }

  return (
    <Wrapper insets='bottom' style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ gap: 24, padding: 20 }}>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <BuddyAvatar
            avatar={buddy.avatar}
            name={buddy.name}
            colorIndex={buddy.colorIndex}
            size={96}
            focusable
          />
          <Text
            style={{
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('xl'),
              marginTop: 6,
            }}
          >
            {buddy.name}
          </Text>
          {buddy.tenure && (
            <Text style={{ color: theme.colors.textAlt }}>
              {buddyTenureLabel(buddy.tenure)}
            </Text>
          )}
          <Text style={secondary}>
            {i18n.t('buddies_sharingSince', {
              date: moment(buddy.pairedAt).format('LL'),
            })}
          </Text>
        </View>
        <Section>
          <InputRowSwitch
            label={i18n.t('buddies_showOnCalendar')}
            value={buddy.showOnCalendar}
            onValueChange={(value) =>
              buddiesEngine.setShowOnCalendar(buddy.inboxId, value)
            }
            lastInSection
          />
        </Section>
        <BuddiesSection
          title={i18n.t('buddies_upcomingPlans')}
          footer={
            card
              ? i18n.t('buddies_plansUpdated', {
                  time: moment(card.updatedAt).fromNow(),
                })
              : undefined
          }
        >
          {upcoming.length === 0 ? (
            <Text style={{ ...secondary, padding: 15 }}>
              {i18n.t('buddies_noUpcomingPlans', { name: buddy.name })}
            </Text>
          ) : (
            upcoming.map((day, index) => {
              const date = moment(day.d, 'YYYY-MM-DD').format('ddd, MMM D')
              return (
                <XView
                  key={day.d}
                  style={{
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 15,
                    borderBottomWidth: index === upcoming.length - 1 ? 0 : 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text style={{ fontFamily: theme.fonts.semiBold }}>
                    {date}
                  </Text>
                  <View
                    style={{ flexShrink: 1, alignItems: 'flex-end', gap: 2 }}
                  >
                    {day.p.map((plan, planIndex) => {
                      const duration = formatMinutes(
                        plan.m,
                        timeDisplayFormat
                      ).formatted
                      const label =
                        plan.s === undefined
                          ? i18n.t('buddies_dayPlanAnyTime', { duration })
                          : i18n.t('buddies_dayPlanAtTime', {
                              time: formatStartTime(plan.s),
                              duration,
                            })
                      const same = () => planSameTime(day.d, plan)
                      return (
                        <ContextMenu
                          key={planIndex}
                          analyticsSurface='buddy_upcoming_plan'
                          onPress={same}
                          accessibilityLabel={i18n.t(
                            'buddies_planSameTimeA11y',
                            { name: buddy.name, plan: `${date}, ${label}` }
                          )}
                          actions={[
                            {
                              id: 'plan_same_time',
                              title: i18n.t('buddies_planSameTime'),
                              systemImage: 'calendar.badge.plus',
                              onPress: same,
                            },
                          ]}
                        >
                          <XView style={{ gap: 6, paddingVertical: 2 }}>
                            <Text style={{ color: theme.colors.textAlt }}>
                              {label}
                            </Text>
                            <LucideIcon
                              icon={CalendarPlusIcon}
                              size={14}
                              color={theme.colors.accent}
                            />
                          </XView>
                        </ContextMenu>
                      )
                    })}
                  </View>
                </XView>
              )
            })
          )}
        </BuddiesSection>
        <Button
          onPress={() => confirmRemoveBuddy(buddy)}
          style={{ alignSelf: 'center' }}
        >
          <Text style={{ color: theme.colors.error }}>
            {i18n.t('buddies_removeBuddy')}
          </Text>
        </Button>
      </ScrollView>
    </Wrapper>
  )
}
