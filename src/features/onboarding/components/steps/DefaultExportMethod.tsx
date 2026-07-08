import {
  Copy as CopyIcon,
  Earth as EarthIcon,
  Hourglass as HourglassIcon,
  Share as ShareIcon,
} from 'lucide-react-native'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import { View, Pressable } from 'react-native'
import i18n from '@/lib/locales'
import { usePreferences, type ReportExportMethod } from '@/stores/preferences'
import ActionButton from '@/components/ui/ActionButton'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import links from '@/constants/links'
import { openURL } from '@/lib/links'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import useTheme from '@/contexts/theme'
import { exportMethodSelectionOptions } from '@/components/DefaultExportMethodSelector'

interface Props {
  goBack: () => void
  goNext: () => void
}

const METHOD_ICON: Record<ReportExportMethod, AppIcon> = {
  copy: CopyIcon,
  share: ShareIcon,
  hourglass: HourglassIcon,
  nwpublisher: EarthIcon,
}

const StepDefaultExportMethod = ({ goNext, goBack }: Props) => {
  const { defaultExportMethod, set } = usePreferences()
  const theme = useTheme()

  const selectedOption = exportMethodSelectionOptions.find(
    (o) => o.value === defaultExportMethod
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
            {i18n.t('howDoYouSubmitYourReport')}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textAlt,
              lineHeight: 20,
            }}
          >
            {i18n.t('howDoYouSubmitYourReport_description')}
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          {exportMethodSelectionOptions.map((opt) => {
            const isSelected = opt.value === defaultExportMethod
            return (
              <Pressable
                key={opt.value}
                onPress={() => set({ defaultExportMethod: opt.value })}
                accessibilityRole='button'
                accessibilityLabel={opt.label}
                accessibilityState={{ selected: isSelected }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderRadius: theme.numbers.borderRadiusMd,
                  borderCurve: 'continuous',
                  borderWidth: 2,
                  borderColor: isSelected
                    ? theme.colors.accent
                    : theme.colors.border,
                  backgroundColor: isSelected
                    ? theme.colors.accentTranslucent
                    : theme.colors.card,
                }}
              >
                <LucideIcon
                  icon={METHOD_ICON[opt.value]}
                  size={18}
                  color={theme.colors.text}
                />
                <Text
                  style={{
                    fontSize: theme.fontSize('md'),
                    fontFamily: isSelected
                      ? theme.fonts.semiBold
                      : theme.fonts.regular,
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <Pressable
          onPress={() => openURL(links.featureRequest)}
          accessibilityRole='link'
        >
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.textAlt,
              textAlign: 'center',
              lineHeight: 18,
            }}
          >
            {i18n.t('dontSeeYourCongregationsApp')}{' '}
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.textAlt,
                textDecorationLine: 'underline',
              }}
            >
              {i18n.t('requestAnIntegration')}
            </Text>
          </Text>
        </Pressable>
      </View>
      <View>
        <ActionButton onPress={goNext}>{ctaLabel}</ActionButton>
        <View style={{ alignItems: 'center', marginTop: 15 }}></View>
      </View>
    </Wrapper>
  )
}

export default StepDefaultExportMethod
