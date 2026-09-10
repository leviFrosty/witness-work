import { ChevronRight as ChevronRightIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import i18n from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import PublisherTypeSelector from '@/components/PublisherTypeSelector'
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
  } = usePublisher()
  const { hasName } = useUser()
  const theme = useTheme()
  const isCheckboxMode = entryMode === 'checkbox'
  const [advancedOpen, setAdvancedOpen] = useState(false)

  useEffect(() => {
    if (!hasCompletedProfileSetup && hasName) {
      setProfile({ hasCompletedProfileSetup: true })
    }
  }, [hasCompletedProfileSetup, hasName, setProfile])

  const showAdvanced = canAdjustCreditLimit || !isCheckboxMode

  return (
    <View style={{ gap: 20 }}>
      <View>
        <ProfileCard editable />
      </View>

      {isCheckboxMode && (
        <>
          <View>
            <Card>
              <Text
                style={{
                  fontSize: theme.fontSize('lg'),
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('lookingForViewHours')}
              </Text>
              <Text>{i18n.t('lookingForViewHours_description')}</Text>
            </Card>
          </View>
        </>
      )}
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
        <PublisherTypeSelector />
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
        {!isCheckboxMode && (
          <InputRowContainer label={i18n.t('annualGoal')}>
            <View style={{ flex: 1 }}>
              <AnnualGoalSelector />
            </View>
          </InputRowContainer>
        )}
        <DefaultExportMethodSelector lastInSection />
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
              {!isCheckboxMode && (
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
