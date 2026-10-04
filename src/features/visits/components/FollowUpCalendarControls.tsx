import { useNavigation } from '@react-navigation/native'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { formatMinutesCompact } from '@/lib/minutes'
import { useCalendarPublishing, useCalendarSync } from '@/stores/calendarSync'
import type { Visit } from '@/types/visit'
import type { RootStackNavigation } from '@/types/rootStack'
import i18n, { type TranslationKey } from '@/lib/locales'
import { analytics } from '@/lib/analytics'

const DURATIONS = [15, 30, 45, 60, 90, 120]

/** Edits domain intent only; publishing happens after the Visit is saved. */
export default function FollowUpCalendarControls({
  followUp,
  onChange,
}: {
  followUp: NonNullable<Visit['followUp']>
  onChange: (followUp: NonNullable<Visit['followUp']>) => void
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const enabled = useCalendarSync((state) => state.enabled)
  // Without its own choice, a follow-up follows the shared default.
  const defaultInclude = useCalendarSync((state) => state.defaultInclude)
  const included = followUp.calendarIncluded ?? defaultInclude
  // Set up on another (primary) device: nothing to do here.
  const configuredElsewhere = useCalendarSync((state) => !!state.sharedCalendar)
  const error = useCalendarPublishing((state) => state.error)
  const duration = followUp.calendarDurationMinutes ?? 30
  const durations = DURATIONS.includes(duration)
    ? DURATIONS
    : [...DURATIONS, duration].sort((a, b) => a - b)
  const past = new Date(followUp.date).getTime() < Date.now()
  const openSettings = () => navigation.navigate('PreferencesCalendar')
  return (
    <>
      <InputRowSwitch
        label={i18n.t('calendarShowFollowUp')}
        description={i18n.t(
          included && past
            ? 'calendarPastFollowUp'
            : 'calendarFollowUpDescription'
        )}
        value={included}
        onValueChange={(calendarIncluded) => {
          analytics.capture('calendar_follow_up_inclusion_changed', {
            included: calendarIncluded,
            configured: enabled || configuredElsewhere,
          })
          onChange({
            ...followUp,
            calendarIncluded,
            calendarDurationMinutes: duration,
          })
        }}
      />
      {included && (
        <>
          <InputRowSelect
            label={i18n.t('calendarDuration')}
            selectProps={{
              data: durations.map((value) => ({
                label: formatMinutesCompact(value),
                value,
              })),
              value: duration,
              onChange: ({ value }) => {
                analytics.capture('calendar_follow_up_duration_changed', {
                  duration_minutes: value,
                })
                onChange({ ...followUp, calendarDurationMinutes: value })
              },
            }}
          />
          {!enabled && !configuredElsewhere && (
            <InputRowContainer label={i18n.t('calendarSetupRequired')}>
              <Button onPress={openSettings}>
                <Text>{i18n.t('calendarSync')}</Text>
              </Button>
            </InputRowContainer>
          )}
          {enabled && !!error && (
            <InputRowContainer
              label={i18n.t('calendarSyncPaused')}
              description={
                <Text style={{ fontSize: 12, color: theme.colors.error }}>
                  {i18n.t(error as TranslationKey)}
                </Text>
              }
            >
              <Button onPress={openSettings}>
                <Text>{i18n.t('calendarSync')}</Text>
              </Button>
            </InputRowContainer>
          )}
        </>
      )}
    </>
  )
}
