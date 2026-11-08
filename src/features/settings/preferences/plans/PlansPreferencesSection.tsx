import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import { View } from 'react-native'
import { useState } from 'react'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import IconButton from '@/components/ui/IconButton'
import { usePreferences } from '@/stores/preferences'
import AvailabilityOnboardingSheet from '@/components/AvailabilityOnboardingSheet'
import { useNavigation } from '@react-navigation/native'
import type { RootStackNavigation } from '@/types/rootStack'
import { midweekMeetingDay, weekendMeetingDay } from '@/lib/routine/habits'
import { weekdayName } from '@/features/routine/lib/weekdays'
import SettingsSearchTarget from '@/features/settings/components/search/SettingsSearchTarget'

const PlansPreferencesSection = () => {
  const theme = useTheme()
  const { offDays, meetingDays } = usePreferences()
  const [availabilityOpen, setAvailabilityOpen] = useState(false)
  const navigation = useNavigation<RootStackNavigation>()
  const midweek = midweekMeetingDay(meetingDays)
  const weekend = weekendMeetingDay(meetingDays)
  const meetingSummary =
    midweek === null && weekend === null
      ? i18n.t('routine.meetings.notSet')
      : [midweek, weekend]
          .filter((day): day is number => day !== null)
          .map(weekdayName)
          .join(' · ')
  const availabilitySummary =
    offDays.length === 0 && meetingDays.length === 0
      ? i18n.t('availability.settingsValueAllAvailable')
      : meetingDays.length === 0
        ? i18n.t('availability.settingsValueNOff', {
            count: offDays.length,
          })
        : offDays.length === 0
          ? i18n.t('availability.settingsValueNMeeting', {
              count: meetingDays.length,
            })
          : i18n.t('availability.settingsValueNOffNMeeting', {
              off: offDays.length,
              meeting: meetingDays.length,
            })

  return (
    <View style={{ gap: 3 }}>
      <Section>
        <SettingsSearchTarget id='meetingDays'>
          <InputRowButton
            wrapValue
            label={i18n.t('routine.meetings.title')}
            onPress={() => navigation.navigate('RoutineSettings')}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Text style={{ color: theme.colors.textAlt, flexShrink: 1 }}>
                {meetingSummary}
              </Text>
              <IconButton icon={ChevronForwardIcon} />
            </View>
          </InputRowButton>
        </SettingsSearchTarget>
        <SettingsSearchTarget id='availability'>
          <InputRowButton
            lastInSection
            wrapValue
            label={i18n.t('availability.settingsRow')}
            onPress={() => setAvailabilityOpen(true)}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Text style={{ color: theme.colors.textAlt, flexShrink: 1 }}>
                {availabilitySummary}
              </Text>
              <IconButton icon={ChevronForwardIcon} />
            </View>
          </InputRowButton>
        </SettingsSearchTarget>
      </Section>
      <AvailabilityOnboardingSheet
        open={availabilityOpen}
        onOpenChange={setAvailabilityOpen}
        markSeenOnDismiss={false}
      />
    </View>
  )
}

export default PlansPreferencesSection
