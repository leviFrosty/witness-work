import { View } from 'react-native'
import { ShieldCheck as ShieldCheckIcon } from 'lucide-react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import Switch from '@/components/ui/Switch'
import LucideIcon from '@/components/ui/LucideIcon'
import Wrapper from '@/components/ui/layout/Wrapper'
import ActionButton from '@/components/ui/ActionButton'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { segmentBoldMarkup } from '@/lib/projectedTotalCopy'
import { usePreferences } from '@/stores/preferences'

interface Props {
  goBack: () => void
  goNext: () => void
}

export const cloudSyncOptedOut = (state: {
  iCloudSyncSetByUser: boolean
  iCloudSyncEnabled: boolean
}) => state.iCloudSyncSetByUser && !state.iCloudSyncEnabled

const CloudSync = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const on = !usePreferences(cloudSyncOptedOut)
  const set = usePreferences((state) => state.set)

  const setOn = (next: boolean) =>
    set(
      next
        ? { iCloudSyncSetByUser: false }
        : { iCloudSyncSetByUser: true, iCloudSyncEnabled: false }
    )

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
      >
        <View style={[styles.stepContentContainer, { marginRight: 0 }]}>
          <Text
            accessibilityRole='header'
            style={[styles.stepTitle, { fontFamily: theme.fonts.bold }]}
          >
            {i18n.t(
              on
                ? 'onboardingCloudSync_titleOn'
                : 'onboardingCloudSync_titleOff'
            )}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textAlt,
              marginBottom: 24,
              lineHeight: 20,
            }}
          >
            {on
              ? segmentBoldMarkup(i18n.t('onboardingCloudSync_desc')).map(
                  (segment, index) => (
                    <Text
                      key={index}
                      style={
                        segment.bold
                          ? {
                              fontFamily: theme.fonts.semiBold,
                              color: theme.colors.accent,
                            }
                          : undefined
                      }
                    >
                      {segment.text}
                    </Text>
                  )
                )
              : i18n.t('onboardingCloudSync_descOff')}
          </Text>
          <Card
            flexDirection='row'
            style={{
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 12,
              paddingHorizontal: 16,
              gap: 12,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                flexShrink: 1,
              }}
            >
              <LucideIcon
                icon={ShieldCheckIcon}
                size={22}
                color={on ? theme.colors.accent : theme.colors.textAlt}
              />
              <Text
                style={{
                  fontSize: 16,
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                  flexShrink: 1,
                }}
              >
                {i18n.t('cloudSync')}
              </Text>
            </View>
            <Switch
              accessibilityLabel={i18n.t('cloudSync')}
              value={on}
              onValueChange={setOn}
              testID='onboarding-cloud-sync-switch'
            />
          </Card>
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.textAlt,
              marginTop: 10,
              lineHeight: 16,
            }}
          >
            {i18n.t('onboardingCloudSync_subtext')}
          </Text>
        </View>
      </KeyboardAwareScrollView>
      <ActionButton onPress={goNext}>{i18n.t('continue')}</ActionButton>
    </Wrapper>
  )
}

export default CloudSync
