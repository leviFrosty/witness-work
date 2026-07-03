import { View } from 'react-native'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faBell } from '@fortawesome/free-solid-svg-icons/faBell'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

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

export default NotificationPreview
