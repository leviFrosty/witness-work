import { View } from 'react-native'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faBell } from '@fortawesome/free-solid-svg-icons'
import { styles } from '../Onboarding.styles'
import OnboardingNav from '../OnboardingNav'
import Text from '../../MyText'
import i18n from '../../../lib/locales'
import Wrapper from '../../layout/Wrapper'
import ActionButton from '../../ActionButton'
import Button from '../../Button'
import useNotifications from '../../../hooks/notifications'
import useTheme from '../../../contexts/theme'

interface Props {
  goBack: () => void
  goNext: () => void
}

/**
 * Renders a mock iOS-style notification banner that teases the exact
 * notification the user will receive if they grant permission. Borrows the
 * Centr pattern — show the reward before asking for the permission — to lift
 * opt-in rates. Purely presentational; no real notification is scheduled.
 */
const NotificationPreview = () => {
  const theme = useTheme()

  return (
    <View
      accessibilityLabel={i18n.t('notificationPreview_title')}
      style={{
        // Tuned to mimic the iOS banner look rather than an in-app card:
        // lighter background, smaller radius, and a more pronounced shadow.
        borderRadius: theme.numbers.borderRadiusLg,
        backgroundColor: theme.colors.backgroundLighter,
        borderWidth: 1,
        borderColor: theme.colors.border,
        paddingVertical: 12,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        shadowColor: theme.colors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 4,
        marginBottom: 24,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: theme.numbers.borderRadiusSm + 3,
          backgroundColor: theme.colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <FontAwesomeIcon
          icon={faBell}
          size={18}
          color={theme.colors.textInverse}
        />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
              letterSpacing: 0.5,
            }}
          >
            {i18n.t('notificationPreview_appName')}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('notificationPreview_timestamp')}
          </Text>
        </View>
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.text,
          }}
        >
          {i18n.t('notificationPreview_title')}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.text,
          }}
        >
          {i18n.t('notificationPreview_body')}
        </Text>
      </View>
    </View>
  )
}

const StepThree = ({ goBack, goNext }: Props) => {
  const notifications = useNotifications()

  return (
    <Wrapper
      style={{
        flexGrow: 1,
        paddingHorizontal: 30,
        paddingTop: 60,
        paddingBottom: 100,
        justifyContent: 'space-between',
      }}
    >
      <OnboardingNav goBack={goBack} />
      <View>
        <NotificationPreview />
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
            notifications.register().then(() => {
              goNext()
            })
          }}
        >
          {i18n.t('allowNotifications')}
        </ActionButton>
        <View style={{ alignItems: 'center', marginTop: 15 }}>
          <Button onPress={goNext}>
            <Text style={styles.navSkip}>{i18n.t('skip')}</Text>
          </Button>
        </View>
      </View>
    </Wrapper>
  )
}

export default StepThree
