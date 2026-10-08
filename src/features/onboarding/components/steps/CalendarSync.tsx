import { useState } from 'react'
import { Platform, View } from 'react-native'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import CalendarPreview from '@/features/onboarding/components/CalendarPreview'
import Text from '@/components/ui/MyText'
import InfoPopover from '@/components/ui/InfoPopover'
import Wrapper from '@/components/ui/layout/Wrapper'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import useTheme from '@/contexts/theme'
import {
  calendarAction,
  calendarErrorKey,
  disconnectCalendar,
  quickConnectCalendar,
} from '@/app/calendar/calendarSync'
import { useCalendarPublishing, useCalendarSync } from '@/stores/calendarSync'
import { analytics } from '@/lib/analytics'
import i18n, { type TranslationKey } from '@/lib/locales'

interface Props {
  goBack: () => void
  goNext: () => void
}

const CalendarSync = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Either answer here means the tray invitation for updaters never shows.
  const answer = () => useCalendarSync.setState({ promptAnswered: true })

  // Skipping after a failed attempt must not leave updates running, or the
  // error that made them skip, behind.
  const skip = async () => {
    answer()
    if (useCalendarSync.getState().enabled) {
      await calendarAction(() => disconnectCalendar(false, 'onboarding')).catch(
        () => undefined
      )
    }
    useCalendarSync.setState({ optedOut: true })
    useCalendarPublishing.setState({ error: null })
  }

  const connect = async () => {
    answer()
    setWorking(true)
    setError(null)
    try {
      const status = await calendarAction(quickConnectCalendar)
      analytics.capture('onboarding_calendar_setup_result', { status })
      goNext()
    } catch (cause) {
      const errorKey = calendarErrorKey(cause)
      analytics.capture('onboarding_calendar_setup_result', {
        status: 'error',
        error_key: errorKey,
      })
      setError(errorKey)
    } finally {
      setWorking(false)
    }
  }

  return (
    <Wrapper
      style={{
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 100,
        justifyContent: 'space-between',
      }}
    >
      <OnboardingNav goBack={goBack} />
      <View>
        <View style={{ marginBottom: 24 }}>
          <CalendarPreview />
        </View>
        <Text style={styles.stepTitle}>
          {i18n.t('calendarOnboardingTitle')}
        </Text>
        <Text style={styles.description}>
          {i18n.t('calendarOnboardingDescription')}
        </Text>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}
        >
          <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
            {i18n.t('calendarOnboardingPrivate')}
          </Text>
          <InfoPopover
            title={i18n.t('calendarOnboardingPrivate')}
            description={i18n.t(
              Platform.OS === 'android'
                ? 'calendarOnboardingPrivate_infoAndroid'
                : 'calendarOnboardingPrivate_info'
            )}
          />
        </View>
        {!!error && (
          <Text style={{ marginTop: 12, color: theme.colors.error }}>
            {i18n.t(error as TranslationKey)}
          </Text>
        )}
      </View>
      <View>
        <ActionButton disabled={working} onPress={connect}>
          {i18n.t('calendarOnboardingConnect')}
        </ActionButton>
        <View style={{ alignItems: 'center', marginTop: 15 }}>
          <Button
            disabled={working}
            onPress={() => {
              analytics.capture('onboarding_step_skipped', {
                step_id: 'calendarSync',
              })
              void skip()
              goNext()
            }}
          >
            <Text style={styles.navSkip}>{i18n.t('skip')}</Text>
          </Button>
        </View>
      </View>
    </Wrapper>
  )
}

export default CalendarSync
