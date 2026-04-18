import i18n from '../../../lib/locales'
import { usePreferences } from '../../../stores/preferences'
import ActionButton from '../../ActionButton'
import Text from '../../MyText'
import Select from '../../Select'
import Wrapper from '../../layout/Wrapper'
import OnboardingNav from '../OnboardingNav'
import { View } from 'react-native'
import useTheme from '../../../contexts/theme'
import { navigationSelectionOptions } from '../../DefaultNavigationSelector'

interface Props {
  goBack: () => void
  goNext: () => void
}

const StepDefaultNav = ({ goNext, goBack }: Props) => {
  const { defaultNavigationMapProvider, set } = usePreferences()
  const theme = useTheme()

  const selectedOption = navigationSelectionOptions.find(
    (o) => o.value === defaultNavigationMapProvider
  )
  // Reflect the just-picked map provider in the CTA when available.
  const ctaLabel = selectedOption
    ? i18n.t('continueWith', { option: selectedOption.label })
    : i18n.t('continue')

  return (
    <Wrapper
      style={{
        paddingHorizontal: 30,
        paddingTop: 60,
        paddingBottom: 100,
        justifyContent: 'space-between',
      }}
    >
      <OnboardingNav goBack={goBack} />
      <View>
        <Text
          style={{
            fontSize: 32,
            fontFamily: theme.fonts.bold,
            marginBottom: 20,
          }}
        >
          {i18n.t('preferredMaps')}
        </Text>
        <Text
          style={{
            marginBottom: 20,
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t('preferredMaps_description')}
        </Text>
        <Select
          data={navigationSelectionOptions}
          onChange={({ value }) => set({ defaultNavigationMapProvider: value })}
          value={defaultNavigationMapProvider}
        />
      </View>
      <View>
        <ActionButton onPress={goNext}>{ctaLabel}</ActionButton>
        <View style={{ alignItems: 'center', marginTop: 15 }}></View>
      </View>
    </Wrapper>
  )
}

export default StepDefaultNav
