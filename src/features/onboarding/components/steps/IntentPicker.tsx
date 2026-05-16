import { View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { IconProp } from '@fortawesome/fontawesome-svg-core'
import {
  faStopwatch,
  faComments,
  faCalendar,
  faCalendarCheck,
  faBullseye,
  faMap,
  faCheck,
} from '@fortawesome/free-solid-svg-icons'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import Wrapper from '@/components/ui/layout/Wrapper'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import { usePreferences, OnboardingIntent } from '@/stores/preferences'
import { getEntryMode } from '@/lib/publisherCapabilities'

interface Props {
  goBack: () => void
  goNext: () => void
}

interface IntentOption {
  id: OnboardingIntent
  icon: IconProp
  labelKey: TranslationKey
  color: string
}

const IntentPicker = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const { onboardingIntents, set, role } = usePreferences()
  const isCheckbox = getEntryMode(role) === 'checkbox'

  const options: IntentOption[] = [
    {
      id: 'trackTime',
      icon: isCheckbox ? faCalendarCheck : faStopwatch,
      labelKey: isCheckbox ? 'intentTrackTimeCheckbox' : 'intentTrackTime',
      color: theme.colors.purple,
    },
    {
      id: 'returnVisits',
      icon: faComments,
      labelKey: 'intentReturnVisits',
      color: theme.colors.cyan,
    },
    {
      id: 'planWeek',
      icon: faCalendar,
      labelKey: 'intentPlanWeek',
      color: theme.colors.indigo,
    },
    {
      id: 'monthlyGoal',
      icon: faBullseye,
      labelKey: 'intentMonthlyGoal',
      color: theme.colors.rose,
    },
    {
      id: 'mapContacts',
      icon: faMap,
      labelKey: 'intentMapContacts',
      color: theme.colors.orange,
    },
  ]

  const toggle = (id: OnboardingIntent) => {
    const next = onboardingIntents.includes(id)
      ? onboardingIntents.filter((v) => v !== id)
      : [...onboardingIntents, id]
    set({ onboardingIntents: next })
  }

  const selectedCount = onboardingIntents.length
  const buttonLabel =
    selectedCount > 0
      ? i18n.t('continueWithCount', { count: selectedCount })
      : i18n.t('continue')

  return (
    <Wrapper
      style={{
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 60,
      }}
    >
      <OnboardingNav goBack={goBack} />
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: 30,
          paddingBottom: 20,
        }}
        showsVerticalScrollIndicator={false}
        enableOnAndroid={true}
      >
        <View style={[styles.stepContentContainer, { marginRight: 0 }]}>
          <Text style={styles.stepTitle}>{i18n.t('intentPickerTitle')}</Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textAlt,
              marginBottom: 24,
              lineHeight: 20,
            }}
          >
            {i18n.t('intentPickerSubtitle')}
          </Text>
          {options.map((opt) => {
            const isSelected = onboardingIntents.includes(opt.id)
            return (
              <Button
                key={opt.id}
                onPress={() => toggle(opt.id)}
                noTransform
                style={{ marginBottom: 8 }}
              >
                <Card
                  flexDirection='row'
                  style={{
                    alignItems: 'center',
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    gap: 0,
                    borderWidth: 2,
                    borderColor: isSelected
                      ? theme.colors.accent
                      : 'transparent',
                    backgroundColor: isSelected
                      ? theme.colors.accentTranslucent
                      : theme.colors.card,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: opt.color,
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginRight: 12,
                    }}
                  >
                    <FontAwesomeIcon
                      icon={opt.icon}
                      size={18}
                      color={theme.colors.textInverse}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        fontFamily: 'Inter_600SemiBold',
                        color: theme.colors.text,
                      }}
                    >
                      {i18n.t(opt.labelKey)}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      marginLeft: 12,
                      justifyContent: 'center',
                      alignItems: 'center',
                      backgroundColor: isSelected
                        ? theme.colors.accent
                        : 'transparent',
                      borderWidth: isSelected ? 0 : 2,
                      borderColor: theme.colors.border,
                    }}
                  >
                    {isSelected ? (
                      <FontAwesomeIcon
                        icon={faCheck}
                        size={14}
                        color={theme.colors.textInverse}
                      />
                    ) : null}
                  </View>
                </Card>
              </Button>
            )
          })}
        </View>
      </KeyboardAwareScrollView>
      <ActionButton onPress={goNext}>{buttonLabel}</ActionButton>
    </Wrapper>
  )
}

export default IntentPicker
