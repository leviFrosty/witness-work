import { useEffect } from 'react'
import { Image, Linking, StyleSheet, View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import { X } from 'lucide-react-native'
import { ANDROID_INSTALL_TARGET } from '@/constants/webInstall'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import {
  dismissInstallBanner,
  useInstallBannerDismissed,
} from '@/lib/webInstall/dismissal'
import { installBannerShows } from '@/lib/webInstall/installBanner'
import {
  promptInstall,
  useInstallPromptState,
} from '@/lib/webInstall/installPrompt'

const APP_ICON = require('@/assets/icon.png')

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    nav.standalone === true
  )
}

export default function InstallAppBanner() {
  const theme = useTheme()
  const dismissed = useInstallBannerDismissed()
  const { event, installed } = useInstallPromptState()
  const visible = installBannerShows(
    {
      userAgent: navigator.userAgent,
      standalone: isStandalone(),
      dismissed,
      canPrompt: event !== null,
      installed,
    },
    ANDROID_INSTALL_TARGET
  )

  useEffect(() => {
    if (visible) analytics.capture('web_install_banner_shown')
  }, [visible])

  if (!visible) return null

  const install = async () => {
    if (ANDROID_INSTALL_TARGET.source === 'play') {
      void Linking.openURL(ANDROID_INSTALL_TARGET.url)
      return
    }

    if ((await promptInstall()) === 'accepted')
      analytics.capture('web_install_accepted')
  }

  return (
    <View
      accessibilityRole='summary'
      style={[
        styles.banner,
        {
          backgroundColor: theme.colors.card,
          borderBottomColor: theme.colors.border,
        },
      ]}
    >
      <Image
        source={APP_ICON}
        style={styles.icon}
        accessibilityIgnoresInvertColors
      />
      <View style={styles.text}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.bold,
          }}
        >
          {i18n.t('webInstall_title')}
        </Text>
        <Text
          numberOfLines={2}
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t('webInstall_message')}
        </Text>
      </View>
      <ActionButton onPress={install} testID='install-app'>
        {i18n.t('webInstall_install')}
      </ActionButton>
      <IconButton
        icon={X}
        frame
        size={20}
        testID='install-dismiss'
        accessibilityLabel={i18n.t('webInstall_dismiss')}
        onPress={() => {
          analytics.capture('web_install_banner_dismissed')
          dismissInstallBanner()
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingStart: 12,
    paddingEnd: 4,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 40, height: 40, borderRadius: 9 },
  text: { flex: 1, minWidth: 0 },
})
