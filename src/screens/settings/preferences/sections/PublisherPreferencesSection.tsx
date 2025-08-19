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

const PublisherPreferencesSection = () => {
  const {
    publisher,
    overrideCreditLimit,
    customCreditLimitHours,
    setOverrideCreditLimit,
    setCustomCreditLimitHours,
  } = usePreferences()
  const theme = useTheme()

  return (
    <View style={{ gap: 5 }}>
      {publisher === 'publisher' && (
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
          lastInSection={publisher === 'publisher'}
        >
          <View style={{ flex: 1 }}>
            <PublisherTypeSelector />
          </View>
        </InputRowContainer>
        {publisher !== 'publisher' && (
          <InputRowContainer label={i18n.t('annualGoal')} lastInSection>
            <View style={{ flex: 1 }}>
              <AnnualGoalSelector />
            </View>
          </InputRowContainer>
        )}
      </Section>

      {/* Credit Limit Override Section - Only show for publishers that normally have a credit limit */}
      {publisher !== 'specialPioneer' && publisher !== 'circuitOverseer' && (
        <>
          <Divider marginVertical={10} />
          <View style={{ paddingHorizontal: 20 }}>
            <Card>
              <Text
                style={{
                  fontSize: theme.fontSize('lg'),
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('overrideCreditLimit')}
              </Text>
              <Text>{i18n.t('overrideCreditLimit_description')}</Text>
            </Card>
          </View>
          <Section>
            <InputRowContainer
              label={i18n.t('overrideCreditLimit')}
              lastInSection={!overrideCreditLimit}
            >
              <View style={{ flex: 1 }}>
                <CheckboxWithLabel
                  value={overrideCreditLimit}
                  setValue={setOverrideCreditLimit}
                  label=''
                  labelPosition='right'
                />
              </View>
            </InputRowContainer>
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
        </>
      )}
    </View>
  )
}

export default PublisherPreferencesSection
