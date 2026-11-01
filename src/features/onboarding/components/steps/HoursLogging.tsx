import { CircleCheck as CircleCheckIcon } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import OnboardingFooter, {
  STEP_BOTTOM_PADDING,
} from '@/features/onboarding/components/OnboardingFooter'
import OnboardingScrollView from '@/features/onboarding/components/OnboardingScrollView'
import ActionButton from '@/components/ui/ActionButton'
import { useCardStyle } from '@/components/ui/Card'
import Wrapper from '@/components/ui/layout/Wrapper'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import useTheme from '@/contexts/theme'
import { setHoursLogging } from '@/lib/hoursLogging'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'

interface Props {
  goBack: () => void
  goNext: () => void
}

type Answer = 'yes' | 'no'

const StepHoursLogging = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const { logsHours, hoursLoggingAsked } = usePreferences(
    useShallow((s) => ({
      logsHours: s.logsHours,
      hoursLoggingAsked: s.hoursLoggingAsked,
    }))
  )

  const [answer, setAnswer] = useState<Answer | null>(
    hoursLoggingAsked ? (logsHours ? 'yes' : 'no') : null
  )
  const [hovered, setHovered] = useState<Answer | null>(null)

  const options: { value: Answer; label: string; description: string }[] = [
    {
      value: 'yes',
      label: i18n.t('hoursLoggingQuestion.yes'),
      description: i18n.t('hoursLoggingQuestion.yes_description'),
    },
    {
      value: 'no',
      label: i18n.t('hoursLoggingQuestion.no'),
      description: i18n.t('hoursLoggingQuestion.no_description'),
    },
  ]

  const handleContinue = () => {
    if (!answer) return
    setHoursLogging(answer === 'yes', 'onboarding')
    goNext()
  }

  return (
    <View style={{ flex: 1 }}>
      <Wrapper
        style={{
          flex: 1,
          paddingHorizontal: 20,
          paddingTop: 60,
          paddingBottom: STEP_BOTTOM_PADDING,
        }}
      >
        <OnboardingNav goBack={goBack} />
        <OnboardingScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: 30,
            paddingBottom: 20,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.stepContentContainer, { marginRight: 0 }]}>
            <Text accessibilityRole='header' style={styles.stepTitle}>
              {i18n.t('hoursLoggingQuestion.title')}
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: theme.colors.textAlt,
                marginTop: -8,
                marginBottom: 24,
                lineHeight: 20,
              }}
            >
              {i18n.t('hoursLoggingQuestion.description')}
            </Text>
            <View
              accessibilityRole='radiogroup'
              accessibilityLabel={i18n.t('hoursLoggingQuestion.title')}
              style={{ ...cardStyle, overflow: 'hidden' }}
            >
              {options.map(({ value, label, description }, index) => {
                const selected = value === answer
                return (
                  <PointerHover
                    key={value}
                    onHoverChange={(isHovered) =>
                      setHovered((current) =>
                        isHovered ? value : current === value ? null : current
                      )
                    }
                  >
                    <Pressable
                      accessibilityRole='radio'
                      accessibilityState={{ selected }}
                      accessibilityLabel={label}
                      accessibilityHint={description}
                      onPress={() => setAnswer(value)}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        minHeight: 64,
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderColor: theme.colors.border,
                        backgroundColor: selected
                          ? theme.colors.accentTranslucent
                          : undefined,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text
                          style={{
                            fontSize: theme.fontSize('md'),
                            fontFamily: selected
                              ? theme.fonts.semiBold
                              : theme.fonts.medium,
                          }}
                        >
                          {label}
                        </Text>
                        <Text
                          style={{
                            fontSize: theme.fontSize('sm'),
                            color: theme.colors.textAlt,
                          }}
                        >
                          {description}
                        </Text>
                      </View>
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {selected ? (
                          <LucideIcon
                            icon={CircleCheckIcon}
                            size={22}
                            color={theme.colors.accent}
                          />
                        ) : (
                          <View
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 10,
                              borderWidth: 1.5,
                              borderColor: theme.colors.border,
                            }}
                          />
                        )}
                      </View>
                      <HoverTint visible={hovered === value} />
                    </Pressable>
                  </PointerHover>
                )
              })}
            </View>
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
                marginTop: 12,
                paddingHorizontal: 4,
              }}
            >
              {i18n.t('hoursLoggingQuestion.changeLater')}
            </Text>
          </View>
        </OnboardingScrollView>
        <OnboardingFooter>
          <ActionButton onPress={handleContinue} disabled={!answer}>
            {i18n.t('continue')}
          </ActionButton>
        </OnboardingFooter>
      </Wrapper>
    </View>
  )
}

export default StepHoursLogging
