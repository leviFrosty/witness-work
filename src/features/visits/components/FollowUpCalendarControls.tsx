import { useNavigation } from '@react-navigation/native'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import { SectionRows } from '@/components/ui/inputs/Section'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { formatMinutesCompact } from '@/lib/minutes'
import { useCalendarPublishing, useCalendarSync } from '@/stores/calendarSync'
import type { Visit } from '@/types/visit'
import type { RootStackNavigation } from '@/types/rootStack'
import i18n, { type TranslationKey } from '@/lib/locales'

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
  const setupRequired = included && !enabled && !configuredElsewhere
  const paused = included && enabled && !!error
  return (
    <SectionRows>
      <InputRowSwitch
        label={i18n.t('calendarShowFollowUp')}
        info={i18n.t('calendarFollowUpDescription')}
        description={
          included && past ? i18n.t('calendarPastFollowUp') : undefined
        }
        value={included}
        lastInSection={!included}
        onValueChange={(calendarIncluded) => {
          onChange({
            ...followUp,
            calendarIncluded,
            calendarDurationMinutes: duration,
          })
        }}
      />
      {included && (
        <InputRowSelect
          label={i18n.t('calendarDuration')}
          lastInSection={!setupRequired && !paused}
          selectProps={{
            data: durations.map((value) => ({
              label: formatMinutesCompact(value),
              value,
            })),
            value: duration,
            onChange: ({ value }) => {
              onChange({ ...followUp, calendarDurationMinutes: value })
            },
          }}
        />
      )}
      {setupRequired && (
        <InputRowContainer
          label={i18n.t('calendarSetupRequired')}
          lastInSection
        >
          <Button onPress={openSettings}>
            <Text>{i18n.t('calendarSync')}</Text>
          </Button>
        </InputRowContainer>
      )}
      {paused && (
        <InputRowContainer
          label={i18n.t('calendarSyncPaused')}
          lastInSection
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
    </SectionRows>
  )
}
