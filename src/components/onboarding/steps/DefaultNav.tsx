import { View, Pressable } from 'react-native'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faApple, faGoogle, faWaze } from '@fortawesome/free-brands-svg-icons'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
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

const PROVIDER_ICON: Record<
  Exclude<DefaultNavigationMapProvider, null>,
  IconDefinition
> = {
  apple: faApple,
  google: faGoogle,
  waze: faWaze,
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
        <View style={{ gap: 6 }}>
          <Text
            style={{
              fontSize: 32,
              fontFamily: theme.fonts.bold,
            }}
          >
            {i18n.t('preferredMaps')}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textAlt,
              lineHeight: 20,
            }}
          >
            {i18n.t('preferredMaps_description')}
          </Text>
        </View>

        <NavMapPreview provider={defaultNavigationMapProvider} />

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {navigationSelectionOptions.map((opt) => {
            if (!opt.value) return null
            const isSelected = opt.value === defaultNavigationMapProvider
            const icon = PROVIDER_ICON[opt.value]
            return (
              <Pressable
                key={opt.value}
                onPress={() => set({ defaultNavigationMapProvider: opt.value })}
                accessibilityRole='button'
                accessibilityLabel={opt.label}
                accessibilityState={{ selected: isSelected }}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 12,
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
                <FontAwesomeIcon
                  icon={icon}
                  size={18}
                  color={theme.colors.text}
                />
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
