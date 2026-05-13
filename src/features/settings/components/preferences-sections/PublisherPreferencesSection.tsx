import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import i18n from '../../../../lib/locales'
import Section from '../../../../components/inputs/Section'
import InputRowContainer from '../../../../components/inputs/InputRowContainer'
import PublisherTypeSelector from '../../../../components/PublisherTypeSelector'
import AnnualGoalSelector from '../../../../components/AnnualGoalSelector'
import ProfileCard from '../../../../components/ProfileCard'
import DateTimePicker from '../../../../components/DateTimePicker'
import { usePreferences } from '../../../../stores/preferences'
import Text from '../../../../components/MyText'
import useTheme from '../../../../contexts/theme'
import Card from '../../../../components/Card'
import Divider from '../../../../components/Divider'
import CheckboxWithLabel from '../../../../components/inputs/CheckboxWithLabel'
import TextInputRow from '../../../../components/inputs/TextInputRow'
import usePublisher from '../../../../hooks/usePublisher'
import { getStartDateLabels } from '../../../../constants/publisher'

const PublisherPreferencesSection = () => {
  const {
    publisher,
    pioneerStartDate,
    hasCompletedProfileSetup,
    overrideCreditLimit,
    customCreditLimitHours,
    autoRolloverEnabled,
    setOverrideCreditLimit,
    setCustomCreditLimitHours,
    setAutoRolloverEnabled,
    set,
  } = usePreferences()
  const {
    type: publisherType,
    entryMode,
    hasName,
    hasUnlimitedCreditDefault,
    tracksPioneerStartDate,
  } = usePublisher()
  const theme = useTheme()
  const isCheckboxMode = entryMode === 'checkbox'
  const [advancedOpen, setAdvancedOpen] = useState(false)

  useEffect(() => {
    if (!hasCompletedProfileSetup && hasName) {
      set({ hasCompletedProfileSetup: true })
    }
  }, [hasCompletedProfileSetup, hasName, set])

  const showAdvanced = !hasUnlimitedCreditDefault || !isCheckboxMode

  return (
    <View style={{ gap: 5 }}>
      <View style={{ paddingHorizontal: 20 }}>
        <ProfileCard editable />
      </View>
      <Divider marginVertical={10} />

      {isCheckboxMode && (
        <>
          <View style={{ paddingHorizontal: 20 }}>
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
          <Divider marginVertical={10} />
        </>
      )}
      {publisherType === 'custom' && (
        <>
          <View style={{ paddingHorizontal: 20 }}>
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
          <Divider marginVertical={10} />
        </>
      )}

      <Section>
        <InputRowContainer label={i18n.t('status')}>
          <View style={{ flex: 1 }}>
            <PublisherTypeSelector />
          </View>
        </InputRowContainer>
        {tracksPioneerStartDate && (
          <InputRowContainer
            label={i18n.t(getStartDateLabels(publisher).label)}
            lastInSection={isCheckboxMode}
          >
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <DateTimePicker
                value={
                  pioneerStartDate ? new Date(pioneerStartDate) : new Date()
                }
                onChange={(_e, date) => {
                  if (date) set({ pioneerStartDate: date })
                }}
                maximumDate={new Date()}
                iOSMode='date'
              />
            </View>
          </InputRowContainer>
        )}
        {!isCheckboxMode && (
          <InputRowContainer label={i18n.t('annualGoal')} lastInSection>
            <View style={{ flex: 1 }}>
              <AnnualGoalSelector />
            </View>
          </InputRowContainer>
        )}
      </Section>

      {showAdvanced && (
        <View style={{ marginTop: 10 }}>
          <Pressable
            onPress={() => setAdvancedOpen((v) => !v)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 25,
              paddingVertical: 12,
            }}
          >
            <Text
              style={{
                fontSize: theme.fontSize('md'),
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {i18n.t('advanced')}
            </Text>
            <FontAwesomeIcon
              icon={faChevronRight}
              size={12}
              color={theme.colors.textAlt}
              style={{
                transform: [{ rotate: advancedOpen ? '90deg' : '0deg' }],
              }}
            />
          </Pressable>

          {advancedOpen && (
            <View style={{ gap: 5 }}>
              {!hasUnlimitedCreditDefault && (
                <Section>
                  <InputRowContainer
                    label={i18n.t('overrideCreditLimit')}
                    lastInSection
                  >
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <CheckboxWithLabel
                        value={overrideCreditLimit}
                        setValue={setOverrideCreditLimit}
                        label=''
                        labelPosition='right'
                      />
                    </View>
                  </InputRowContainer>
                  <Text
                    style={{
                      fontSize: theme.fontSize('sm'),
                      color: theme.colors.textAlt,
                    }}
                  >
                    {i18n.t('overrideCreditLimit_description')}
                  </Text>
                  {overrideCreditLimit && (
                    <TextInputRow
                      label={i18n.t('customCreditLimitHours')}
                      lastInSection
                      textInputProps={{
                        value: customCreditLimitHours.toString(),
                        onChangeText: (value) => {
                          const numValue = parseInt(value) || 0
                          if (numValue >= 0 && numValue <= 200) {
                            setCustomCreditLimitHours(numValue)
                          }
                        },
                        keyboardType: 'numeric',
                        placeholder: '55',
                      }}
                    />
                  )}
                </Section>
              )}
              {!isCheckboxMode && (
                <Section>
                  <InputRowContainer
                    label={i18n.t('autoRollover')}
                    lastInSection
                  >
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <CheckboxWithLabel
                        value={autoRolloverEnabled}
                        setValue={setAutoRolloverEnabled}
                        label=''
                        labelPosition='right'
                      />
                    </View>
                  </InputRowContainer>
                  <Text
                    style={{
                      fontSize: theme.fontSize('sm'),
                      color: theme.colors.textAlt,
                    }}
                  >
                    {i18n.t('autoRollover_description')}
                  </Text>
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
