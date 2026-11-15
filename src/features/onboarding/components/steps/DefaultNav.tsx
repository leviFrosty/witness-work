import { Check as CheckIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { View, Platform, StyleSheet } from 'react-native'
import { resolveNavigationMapProvider } from '@/lib/navigationMapProvider'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import AppIconImage, { mapAppIconSource } from '@/components/AppIconImage'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import useTheme from '@/contexts/theme'
import { navigationSelectionOptions } from '@/components/DefaultNavigationSelector'
import NavMapPreview from '@/features/onboarding/components/NavMapPreview'

interface Props {
  goBack: () => void
  goNext: () => void
}

const TILE_ICON_SIZE = 52
const TILE_PADDING = 14
const TILE_RADIUS = 26

const StepDefaultNav = ({ goNext, goBack }: Props) => {
  const { defaultNavigationMapProvider: savedProvider, set } = usePreferences()
  const defaultNavigationMapProvider = resolveNavigationMapProvider(
    savedProvider,
    Platform.OS
  )
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
        gap: 20,
      }}
    >
      <OnboardingNav goBack={goBack} />
      {}
      <View style={{ gap: 20, flexShrink: 1 }}>
        <View style={{ gap: 6 }}>
          <Text
            accessibilityRole='header'
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

        <View
          style={{ flexDirection: 'row', gap: 10 }}
          accessibilityRole='radiogroup'
        >
          {navigationSelectionOptions.map((opt) => {
            if (!opt.value) return null
            const isSelected = opt.value === defaultNavigationMapProvider
            return (
              <Button
                key={opt.value}
                onPress={() => set({ defaultNavigationMapProvider: opt.value })}
                accessibilityRole='radio'
                accessibilityLabel={opt.label}
                accessibilityState={{ selected: isSelected }}
                style={[
                  styles.tile,
                  {
                    borderColor: isSelected
                      ? theme.colors.accent
                      : theme.colors.border,
                    backgroundColor: isSelected
                      ? theme.colors.accentTranslucent
                      : theme.colors.card,
                  },
                ]}
              >
                <View>
                  <AppIconImage
                    source={mapAppIconSource(opt.value)}
                    size={TILE_ICON_SIZE}
                  />
                  {isSelected && (
                    <View
                      style={[
                        styles.check,
                        {
                          backgroundColor: theme.colors.accent,
                          borderColor: theme.colors.card,
                        },
                      ]}
                    >
                      <LucideIcon
                        icon={CheckIcon}
                        size={12}
                        strokeWidth={3}
                        color={theme.colors.textInverse}
                      />
                    </View>
                  )}
                </View>
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: isSelected
                      ? theme.fonts.bold
                      : theme.fonts.semiBold,
                    color: theme.colors.text,
                  }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {opt.label}
                </Text>
              </Button>
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

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingTop: TILE_PADDING,
    paddingBottom: 12,
    paddingHorizontal: 8,
    borderRadius: TILE_RADIUS,
    borderCurve: 'continuous',
    borderWidth: 2,
  },
  check: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default StepDefaultNav
