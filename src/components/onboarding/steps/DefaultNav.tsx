import { View, Pressable } from 'react-native'
import i18n from '../../../lib/locales'
import {
  usePreferences,
  type DefaultNavigationMapProvider,
} from '../../../stores/preferences'
import ActionButton from '../../ActionButton'
import Text from '../../MyText'
import Wrapper from '../../layout/Wrapper'
import OnboardingNav from '../OnboardingNav'
import useTheme from '../../../contexts/theme'
import { navigationSelectionOptions } from '../../DefaultNavigationSelector'
import NavMapPreview from '../NavMapPreview'

interface Props {
  goBack: () => void
  goNext: () => void
}

// Brand-y swatch on each chip — same accent the route uses on the preview, so
// chip and preview read as the same "this is your map" identity.
const PROVIDER_SWATCH: Record<
  Exclude<DefaultNavigationMapProvider, null>,
  string
> = {
  apple: '#0A84FF',
  google: '#4285F4',
  waze: '#33CCFF',
}

const StepDefaultNav = ({ goNext, goBack }: Props) => {
  const { defaultNavigationMapProvider, set } = usePreferences()
  const theme = useTheme()

  const selectedOption = navigationSelectionOptions.find(
    (o) => o.value === defaultNavigationMapProvider
  )
  const ctaLabel = selectedOption
    ? i18n.t('continueWith', { option: selectedOption.label })
    : i18n.t('continue')

  return (
    <Wrapper
      style={{
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 100,
        justifyContent: 'space-between',
      }}
    >
      <OnboardingNav goBack={goBack} />
      <View style={{ gap: 20 }}>
        <Text
          style={{
            fontSize: 32,
            fontFamily: theme.fonts.bold,
          }}
        >
          {i18n.t('preferredMaps')}
        </Text>

        <NavMapPreview provider={defaultNavigationMapProvider} />

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {navigationSelectionOptions.map((opt) => {
            if (!opt.value) return null
            const isSelected = opt.value === defaultNavigationMapProvider
            const swatch = PROVIDER_SWATCH[opt.value]
            return (
              <Pressable
                key={opt.value}
                onPress={() => set({ defaultNavigationMapProvider: opt.value })}
                accessibilityRole='button'
                accessibilityState={{ selected: isSelected }}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 10,
                  paddingHorizontal: 8,
                  borderRadius: 999,
                  borderWidth: 2,
                  borderColor: isSelected
                    ? theme.colors.accent
                    : theme.colors.border,
                  backgroundColor: isSelected
                    ? theme.colors.accentTranslucent
                    : theme.colors.card,
                }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: swatch,
                  }}
                />
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: isSelected
                      ? theme.fonts.bold
                      : theme.fonts.semiBold,
                    color: theme.colors.text,
                  }}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>
      <View>
        <ActionButton onPress={goNext}>{ctaLabel}</ActionButton>
        <View style={{ alignItems: 'center', marginTop: 15 }}></View>
      </View>
    </Wrapper>
  )
}

export default StepDefaultNav
