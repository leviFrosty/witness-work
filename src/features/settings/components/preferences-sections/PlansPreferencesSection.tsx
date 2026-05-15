import { Switch, View } from 'react-native'
import { useState } from 'react'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowButton from '@/features/settings/components/inputs/InputRowButton'
import IconButton from '@/components/ui/IconButton'
import Select from '@/components/ui/Select'
import {
  DEFAULT_PLAN_NOTIFICATION_OFFSET,
  usePreferences,
} from '@/stores/preferences'
import AvailabilityOnboardingSheet from '@/components/AvailabilityOnboardingSheet'

const PlansPreferencesSection = () => {
  const theme = useTheme()
  const {
    planNotificationOffset,
    planAlwaysNotify,
    excludedWeekdays,
    meetingWeekdays,
    set,
  } = usePreferences()
  const [availabilityOpen, setAvailabilityOpen] = useState(false)
  const availabilitySummary =
    excludedWeekdays.length === 0 && meetingWeekdays.length === 0
      ? i18n.t('availability.settingsValueAllAvailable')
      : meetingWeekdays.length === 0
        ? i18n.t('availability.settingsValueNExcluded', {
            count: excludedWeekdays.length,
          })
        : excludedWeekdays.length === 0
          ? i18n.t('availability.settingsValueNMeeting', {
              count: meetingWeekdays.length,
            })
          : i18n.t('availability.settingsValueNExcludedNMeeting', {
              excluded: excludedWeekdays.length,
              meeting: meetingWeekdays.length,
            })

  const currentAmount =
    planNotificationOffset?.amount ?? DEFAULT_PLAN_NOTIFICATION_OFFSET.amount
  const currentUnit =
    planNotificationOffset?.unit ?? DEFAULT_PLAN_NOTIFICATION_OFFSET.unit

  const amountOptions = [...Array(1000).keys()].map((value) => ({
    label: `${value}`,
    value,
  }))

  const unitOptions: {
    label: string
    value: moment.unitOfTime.DurationConstructor
  }[] = ['minutes', 'hours', 'days', 'weeks'].map((value) => ({
    label: i18n.t(`${value}_lowercase` as TranslationKey),
    value: value as moment.unitOfTime.DurationConstructor,
  }))

  return (
    <View style={{ gap: 3 }}>
      <Section>
        <InputRowContainer
          lastInSection
          style={{
            flexDirection: 'column',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {i18n.t('notificationOffset')}
            </Text>
            <View style={{ flex: 1 }}>
              <Select
                data={amountOptions}
                onChange={({ value }) =>
                  set({
                    planNotificationOffset: {
                      amount: value,
                      unit: currentUnit,
                    },
                  })
                }
                value={currentAmount}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Select
                data={unitOptions}
                onChange={({ value }) =>
                  set({
                    planNotificationOffset: {
                      amount: currentAmount,
                      unit: value,
                    },
                  })
                }
                value={currentUnit}
              />
            </View>
            <Text style={{ color: theme.colors.textAlt }}>
              {i18n.t('before')}
            </Text>
          </View>
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('planNotificationOffset_description')}
          </Text>
        </InputRowContainer>
        <InputRowContainer
          label={i18n.t('planAlwaysNotify')}
          style={{ justifyContent: 'space-between' }}
        >
          <Switch
            value={planAlwaysNotify}
            onValueChange={(value) => set({ planAlwaysNotify: value })}
          />
        </InputRowContainer>
        <InputRowButton
          lastInSection
          label={i18n.t('availability.settingsRow')}
          onPress={() => setAvailabilityOpen(true)}
        >
          <Text style={{ color: theme.colors.textAlt }}>
            {availabilitySummary}
          </Text>
          <IconButton icon={faChevronRight} />
        </InputRowButton>
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
