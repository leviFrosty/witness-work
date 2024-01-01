import { View } from 'react-native'
import Text from '../../../../components/MyText'
import useTheme from '../../../../contexts/theme'
import i18n from '../../../../lib/locales'
import Section from '../../../../components/inputs/Section'
import InputRowContainer from '../../../../components/inputs/InputRowContainer'
import PublisherTypeSelector from '../../../../components/PublisherTypeSelector'

const PublisherPreferencesSection = () => {
  const theme = useTheme()

  return (
    <View style={{ gap: 3 }}>
      <Text
        style={{
          marginLeft: 20,
          fontFamily: theme.fonts.semiBold,
          fontSize: 12,
          color: theme.colors.textAlt,
          textTransform: 'uppercase',
        }}
      >
        {i18n.t('publisher')}
      </Text>
      <Section>
        <InputRowContainer label={i18n.t('status')} lastInSection>
          <View style={{ flex: 1 }}>
            <PublisherTypeSelector />
          </View>
        </InputRowContainer>
      </Section>
    </View>
  )
}

export default PublisherPreferencesSection
