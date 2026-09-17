import { analytics } from '@/lib/analytics'
import * as Notifications from 'expo-notifications'
import { View } from 'react-native'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import NotificationPreview from '@/features/onboarding/components/NotificationPreview'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import Wrapper from '@/components/ui/layout/Wrapper'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import useNotifications from '@/hooks/notifications'

interface Props {
  goBack: () => void
  goNext: () => void
}

const StepThree = ({ goBack, goNext }: Props) => {
  const notifications = useNotifications()

  return (
    <Wrapper
      style={{
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 100,
        justifyContent: 'space-between',
      }}
    >
      <OnboardingNav goBack={goBack} />
      <View>
        <View style={{ marginBottom: 24 }}>
          <NotificationPreview />
        </View>
        <Text style={styles.stepTitle}>
          {i18n.t('neverForgetAReturnVisit')}
        </Text>
        <Text style={styles.description}>
          {i18n.t('neverForgetAReturnVisit_description')}
        </Text>
      </View>
      <View>
        <ActionButton
          onPress={async () => {
            analytics.capture('onboarding_notification_permission_requested')
            try {
              await notifications.register()
              void Notifications.getPermissionsAsync()
                .then((permission) => {
                  analytics.capture(
                    'onboarding_notification_permission_result',
                    { status: permission.status }
                  )
                })
                .catch(() => {
                  analytics.capture(
                    'onboarding_notification_permission_result',
                    { status: 'unknown' }
                  )
                })
              goNext()
            } catch {
              analytics.capture('onboarding_notification_permission_result', {
                status: 'error',
              })
            }
          }}
        >
          {i18n.t('allowNotifications')}
        </ActionButton>
        <View style={{ alignItems: 'center', marginTop: 15 }}>
          <Button
            onPress={() => {
              analytics.capture('onboarding_step_skipped', {
                step_id: 'notifications',
              })
              goNext()
            }}
          >
            <Text style={styles.navSkip}>{i18n.t('skip')}</Text>
          </Button>
        </View>
      </View>
    </Wrapper>
  )
}

export default StepThree
