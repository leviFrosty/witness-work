import {
  Car as CarIcon,
  ChevronDown as ChevronDownIcon,
  History as HistoryIcon,
} from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import { useNavigation } from '@react-navigation/native'
import IconButton from '@/components/ui/IconButton'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import type { RootStackNavigation } from '@/types/rootStack'
import LucideIcon from '@/components/ui/LucideIcon'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import { useEffect, useRef, useState } from 'react'
import { Pressable, TextInput as RNTextInput, View } from 'react-native'
import i18n from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import { setHoursLogging } from '@/lib/hoursLogging'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import PublisherTypeSelector from '@/components/PublisherTypeSelector'
import AuxiliaryMonthRow from '@/features/service-reports/components/AuxiliaryMonthRow'
import DefaultExportMethodSelector from '@/components/DefaultExportMethodSelector'
import AnnualGoalSelector from '@/features/settings/components/AnnualGoalSelector'
import ProfileCard from '@/features/profile/components/ProfileCard'
import BuddiesAccountNameHint from '@/features/buddies/components/BuddiesAccountNameHint'
import DateTimePicker from '@/components/ui/DateTimePicker'
import { PREFERENCE_DEFAULTS, usePreferences } from '@/stores/preferences'
import useGoalHoursInput from '@/hooks/useGoalHoursInput'
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
    mileageTrackingEnabled,
    publisherHours,
    setAutoRolloverEnabled,
    setRolloverIncludesCredit,
    set,
  } = usePreferences()

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
  const [advancedHovered, setAdvancedHovered] = useState(false)

  const logHoursGoal = useGoalHoursInput({
    hours: publisherHours.publisher,
    defaultHours: PREFERENCE_DEFAULTS.publisherHours.publisher,
    onSave: (publisher) =>
      set((s) => ({ publisherHours: { ...s.publisherHours, publisher } })),
  })
  const logHoursGoalInput = useRef<RNTextInput>(null)

  useEffect(() => {
    if (!hasCompletedProfileSetup && hasName) {
      setProfile({ hasCompletedProfileSetup: true })
    }
  }, [hasCompletedProfileSetup, hasName, setProfile])

  const handleMileageChange = (enabled: boolean) => {
    set({ mileageTrackingEnabled: enabled })
    analytics.capture('mileage_tracking_changed', {
      enabled,
      source: 'publisher_preferences',
    })
  }

  const navigation = useNavigation<RootStackNavigation>()
  const showAdvanced = canAdjustCreditLimit || showsTimeEntry

  const showAnnualGoal =
    !isCheckboxMode || (showsTimeEntry && monthlyGoalHours > 0)

  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 8 }}>
        <ProfileCard />
        <BuddiesAccountNameHint
          style={{ fontSize: theme.fontSize('sm'), paddingHorizontal: 15 }}
        />
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
            onValueChange={(enabled) => setHoursLogging(enabled, 'settings')}
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
              ...logHoursGoal,
              returnKeyType: 'done',
              inputMode: 'decimal',
              textAlign: 'start',
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
          <IconButton icon={ChevronForwardIcon} />
        </InputRowButton>
      </Section>

      <Section>
        <InputRowSwitch
          label={i18n.t('mileage.trackMileage')}
          info={i18n.t('mileage.trackMileage_info')}
          value={mileageTrackingEnabled === true}
          onValueChange={handleMileageChange}
          lastInSection={mileageTrackingEnabled !== true}
        />
        {mileageTrackingEnabled === true && (
          <InputRowButton
            leftIcon={CarIcon}
            label={i18n.t('mileage.title')}
            sublabel={i18n.t('mileage.settingsRow_description')}
            onPress={() => navigation.navigate('Mileage')}
            lastInSection
          >
            <IconButton icon={ChevronForwardIcon} />
          </InputRowButton>
        )}
      </Section>

      {showAdvanced && (
        <View style={{ marginTop: 10 }}>
          <PointerHover onHoverChange={setAdvancedHovered}>
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
                icon={advancedOpen ? ChevronDownIcon : ChevronForwardIcon}
                size={12}
                color={theme.colors.textAlt}
              />
              <HoverTint
                visible={advancedHovered}
                borderRadius={theme.numbers.borderRadiusMd}
              />
            </Pressable>
          </PointerHover>

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
