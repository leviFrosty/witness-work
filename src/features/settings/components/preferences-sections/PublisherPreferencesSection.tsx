import {
  ChevronRight as ChevronRightIcon,
  History as HistoryIcon,
} from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import IconButton from '@/components/ui/IconButton'
import InputRowButton from '@/features/settings/components/inputs/InputRowButton'
import type { RootStackNavigation } from '@/types/rootStack'
import LucideIcon from '@/components/ui/LucideIcon'
import { useEffect, useRef, useState } from 'react'
import { Pressable, TextInput as RNTextInput, View } from 'react-native'
import i18n from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import PublisherTypeSelector from '@/components/PublisherTypeSelector'
import AuxiliaryMonthRow from '@/features/service-reports/components/AuxiliaryMonthRow'
import DefaultExportMethodSelector from '@/components/DefaultExportMethodSelector'
import AnnualGoalSelector from '@/features/settings/components/AnnualGoalSelector'
import ProfileCard from '@/features/profile/components/ProfileCard'
import DateTimePicker from '@/components/ui/DateTimePicker'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import Card from '@/components/ui/Card'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import MonthlyMaximumCreditHoursSection from '@/features/settings/components/preferences-sections/MonthlyMaximumCreditHoursSection'
import usePublisher from '@/hooks/usePublisher'
import useUser from '@/hooks/useUser'
import { getStartDateLabels } from '@/constants/publisher'

const PublisherPreferencesSection = () => {
  const {
    role,
    tenureStartDate,
    autoRolloverEnabled,
    rolloverIncludesCredit,
    logsHours,
    publisherHours,
    setAutoRolloverEnabled,
    setRolloverIncludesCredit,
    set,
  } = usePreferences()
  // `hasCompletedProfileSetup` lives in the Profile store after wave-3 because
  // it gates Profile data (name + avatar) being filled in.
  const { hasCompletedProfileSetup, set: setProfile } = useProfile()
  const {
    type: publisherType,
    entryMode,
    canAdjustCreditLimit,
    tracksTenure,
    showsTimeEntry,
    monthlyGoalHours,
  } = usePublisher('standing')
  const { hasName } = useUser()
  const theme = useTheme()
  const isCheckboxMode = entryMode === 'checkbox'
  const [advancedOpen, setAdvancedOpen] = useState(false)
  // Hours Logging goal input — mirrors the Custom role's goal input in
  // `PublisherTypeSelector`: local text state, persisted on blur.
  const [logHoursGoal, setLogHoursGoal] = useState(
    publisherHours.publisher.toString()
  )
  const logHoursGoalInput = useRef<RNTextInput>(null)

  useEffect(() => {
    if (!hasCompletedProfileSetup && hasName) {
      setProfile({ hasCompletedProfileSetup: true })
    }
  }, [hasCompletedProfileSetup, hasName, setProfile])

  const handleLogsHoursChange = (enabled: boolean) => {
    set({ logsHours: enabled })
    analytics.capture('hours_logging_changed', { enabled })
  }

  const saveLogHoursGoal = () => {
    const parsed = parseFloat(logHoursGoal)
    const next = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
    setLogHoursGoal(next.toString())
    set({ publisherHours: { ...publisherHours, publisher: next } })
  }

  const navigation = useNavigation<RootStackNavigation>()
  const showAdvanced = canAdjustCreditLimit || showsTimeEntry
  // Hours-mode roles always get the annual-goal row. A publisher logging hours
  // only gets it once they have a monthly goal to multiply (annual = ×12).
  const showAnnualGoal =
    !isCheckboxMode || (showsTimeEntry && monthlyGoalHours > 0)

  return (
    <View style={{ gap: 20 }}>
      <View>
        <ProfileCard editable />
      </View>

      {publisherType === 'custom' && (
        <>
          <View>
            <Card>
              <Text
                style={{
                  fontSize: theme.fontSize('lg'),
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('dontWantGoal')}
              </Text>
              <Text>{i18n.t('dontWantGoal_description')}</Text>
            </Card>
          </View>
        </>
      )}

      <Section>
        <PublisherTypeSelector askStartMonth />
        {tracksTenure && (
          <InputRowContainer label={i18n.t(getStartDateLabels(role).label)}>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <DateTimePicker
                value={tenureStartDate ? new Date(tenureStartDate) : new Date()}
                onChange={(_e, date) => {
                  if (date) set({ tenureStartDate: date })
                }}
                maximumDate={new Date()}
                iOSMode='date'
              />
            </View>
          </InputRowContainer>
        )}
        {isCheckboxMode && (
          <InputRowSwitch
            label={i18n.t('logHours')}
            info={i18n.t('logHours_description')}
            value={logsHours}
            onValueChange={handleLogsHoursChange}
          />
        )}
        {isCheckboxMode && logsHours && (
          <TextInputRow
            ref={logHoursGoalInput}
            label={i18n.t('logHoursGoal')}
            info={i18n.t('logHoursGoal_description')}
            controlStyle={{ width: 96 }}
            textInputProps={{
              accessibilityLabel: i18n.t('logHoursGoal'),
              maxLength: 5,
              value: logHoursGoal,
              onChangeText: setLogHoursGoal,
              onBlur: saveLogHoursGoal,
              inputMode: 'decimal',
              textAlign: 'left',
            }}
          />
        )}
        {showAnnualGoal && (
          <InputRowContainer label={i18n.t('annualGoal')}>
            <View style={{ flex: 1 }}>
              <AnnualGoalSelector />
            </View>
          </InputRowContainer>
        )}
        <DefaultExportMethodSelector lastInSection />
      </Section>

      {isCheckboxMode ? (
        <Section>
          <AuxiliaryMonthRow source='settings' variant='row' />
        </Section>
      ) : null}

      <Section>
        <InputRowButton
          leftIcon={HistoryIcon}
          label={i18n.t('serviceHistory.settingsRow')}
          sublabel={i18n.t('serviceHistory.settingsRow_description')}
          onPress={() =>
            navigation.navigate('ServiceHistory', { source: 'settings' })
          }
          lastInSection
        >
          <IconButton icon={ChevronRightIcon} />
        </InputRowButton>
      </Section>

      {showAdvanced && (
        <View style={{ marginTop: 10 }}>
          <Pressable
            accessibilityRole='button'
            accessibilityState={{ expanded: advancedOpen }}
            onPress={() => setAdvancedOpen((v) => !v)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 16,
            }}
          >
            <Text
              style={{
                fontSize: theme.fontSize('md'),
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('advanced')}
            </Text>
            <LucideIcon
              icon={ChevronRightIcon}
              size={12}
              color={theme.colors.textAlt}
              style={{
                transform: [{ rotate: advancedOpen ? '90deg' : '0deg' }],
              }}
            />
          </Pressable>

          {advancedOpen && (
            <View style={{ gap: 20 }}>
              {canAdjustCreditLimit && (
                <MonthlyMaximumCreditHoursSection key={publisherType} />
              )}
              {showsTimeEntry && (
                <Section>
                  <InputRowSwitch
                    label={i18n.t('autoRollover')}
                    info={i18n.t('autoRollover_description')}
                    value={autoRolloverEnabled}
                    onValueChange={setAutoRolloverEnabled}
                  />
                  <InputRowSwitch
                    label={i18n.t('rolloverIncludesCredit')}
                    info={i18n.t('rolloverIncludesCredit_description')}
                    value={rolloverIncludesCredit}
                    onValueChange={setRolloverIncludesCredit}
                    lastInSection
                  />
                </Section>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  )
}

export default PublisherPreferencesSection
