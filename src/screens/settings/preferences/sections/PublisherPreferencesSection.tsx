import { View } from 'react-native'
import i18n from '../../../../lib/locales'
import Section from '../../../../components/inputs/Section'
import InputRowContainer from '../../../../components/inputs/InputRowContainer'
import PublisherTypeSelector from '../../../../components/PublisherTypeSelector'
import AnnualGoalSelector from '../../../../components/AnnualGoalSelector'
import { usePreferences } from '../../../../stores/preferences'
import Text from '../../../../components/MyText'
import useTheme from '../../../../contexts/theme'
import Card from '../../../../components/Card'
import Divider from '../../../../components/Divider'
import CheckboxWithLabel from '../../../../components/inputs/CheckboxWithLabel'
import TextInputRow from '../../../../components/inputs/TextInputRow'
import usePublisher from '../../../../hooks/usePublisher'

const PublisherPreferencesSection = () => {
  const {
    overrideCreditLimit,
    customCreditLimitHours,
    autoRolloverEnabled,
    setOverrideCreditLimit,
    setCustomCreditLimitHours,
    setAutoRolloverEnabled,
  } = usePreferences()
  const {
    type: publisher,
    entryMode,
    hasUnlimitedCreditDefault,
  } = usePublisher()
  const theme = useTheme()
  const isCheckboxMode = entryMode === 'checkbox'

  return (
    <View style={{ gap: 5 }}>
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
              <Text style={{}}>
                {i18n.t('lookingForViewHours_description')}
              </Text>
            </Card>
          </View>
          <Divider marginVertical={10} />
        </>
      )}
      {publisher === 'custom' && (
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
        <InputRowContainer
          label={i18n.t('status')}
          lastInSection={isCheckboxMode}
        >
          <View style={{ flex: 1 }}>
            <PublisherTypeSelector />
          </View>
        </InputRowContainer>
        {!isCheckboxMode && (
          <InputRowContainer label={i18n.t('annualGoal')} lastInSection>
            <View style={{ flex: 1 }}>
              <AnnualGoalSelector />
            </View>
          </InputRowContainer>
        )}
      </Section>

      {!hasUnlimitedCreditDefault && (
        <Section>
          <InputRowContainer
            label={i18n.t('overrideCreditLimit')}
            lastInSection
          >
            <View style={{ flex: 1 }}>
              <View
                style={{
                  flex: 1,
                  alignItems: 'flex-end',
                }}
              >
                <CheckboxWithLabel
                  value={overrideCreditLimit}
                  setValue={setOverrideCreditLimit}
                  label=''
                  labelPosition='right'
                />
              </View>
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
            <>
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
            </>
          )}
        </Section>
      )}
      {!isCheckboxMode && (
        <Section>
          <InputRowContainer label={i18n.t('autoRollover')} lastInSection>
            <View style={{ flex: 1 }}>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <CheckboxWithLabel
                  value={autoRolloverEnabled}
                  setValue={setAutoRolloverEnabled}
                  label=''
                  labelPosition='right'
                />
              </View>
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
  )
}

export default PublisherPreferencesSection
