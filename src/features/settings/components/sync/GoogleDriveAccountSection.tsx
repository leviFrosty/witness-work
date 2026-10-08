import { useState } from 'react'
import { ActivityIndicator, Alert, View } from 'react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import { usePreferences } from '@/stores/preferences'
import { disconnectGoogleDrive } from '@/lib/syncTransport/googleDrive/googleDriveAuth'
import { connectGoogleDriveFromUser } from '@/app/sync/googleDriveConnect'

/**
 * Android: the Google Account this device syncs with. Shows whether Google
 * Drive is connected and offers reconnecting, switching account, and
 * disconnecting. The account is never named: the app only keeps a hash of it.
 */
const GoogleDriveAccountSection = () => {
  const theme = useTheme()
  const connected = usePreferences((s) => s.googleDriveAccountId !== null)
  const needsReconnect = usePreferences((s) => s.googleDriveNeedsReconnect)
  const [busy, setBusy] = useState(false)

  const connect = async (selectAccount: boolean) => {
    setBusy(true)
    try {
      await connectGoogleDriveFromUser({
        source: needsReconnect ? 'reconnect' : 'settings',
        selectAccount,
      })
    } finally {
      setBusy(false)
    }
  }

  const switchAccount = () => {
    if (!usePreferences.getState().iCloudSyncEnabled) {
      void connect(true)
      return
    }
    Alert.alert(
      i18n.t('googleDriveSwitchConfirm_title'),
      i18n.t('googleDriveSwitchConfirm_description'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('googleDriveSwitchConfirm_action'),
          onPress: () => void connect(true),
        },
      ]
    )
  }

  const disconnect = () => {
    Alert.alert(
      i18n.t('googleDriveDisconnectConfirm_title'),
      i18n.t('googleDriveDisconnectConfirm_description'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('googleDriveDisconnect'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true)
            try {
              const { iCloudSyncEnabled, set } = usePreferences.getState()
              // Disconnecting is an explicit off: Supporter auto-enable must
              // not turn sync back on when an account is connected again.
              set({ iCloudSyncEnabled: false, iCloudSyncSetByUser: true })
              if (iCloudSyncEnabled)
                analytics.capture('icloud_sync_enabled_changed', {
                  enabled: false,
                  source: 'google_drive_disconnect',
                })
              await disconnectGoogleDrive()
              analytics.capture('google_drive_disconnected')
            } finally {
              setBusy(false)
            }
          },
        },
      ]
    )
  }

  const status = !connected
    ? i18n.t('googleDriveAccountNotConnected')
    : needsReconnect
      ? i18n.t('googleDriveAccountNeedsReconnect')
      : i18n.t('googleDriveAccountConnected')

  return (
    <Section>
      <InputRowContainer
        label={i18n.t('googleDriveAccountLabel')}
        controlWidth='auto'
        style={{ justifyContent: 'space-between' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {busy && (
            <ActivityIndicator size='small' color={theme.colors.textAlt} />
          )}
          <Text style={{ color: theme.colors.textAlt, textAlign: 'right' }}>
            {status}
          </Text>
        </View>
      </InputRowContainer>
      {(!connected || needsReconnect) && (
        <InputRowButton
          label={i18n.t(
            needsReconnect ? 'googleDriveReconnect' : 'googleDriveConnect'
          )}
          onPress={() => void connect(false)}
          disabled={busy}
          lastInSection={!connected}
        >
          <Text style={{ color: theme.colors.accent }}>
            {i18n.t('googleDriveConnectAction')}
          </Text>
        </InputRowButton>
      )}
      {connected && !needsReconnect && (
        <InputRowButton
          label={i18n.t('googleDriveSwitchAccount')}
          onPress={switchAccount}
          disabled={busy}
        >
          <Text style={{ color: theme.colors.accent }}>
            {i18n.t('googleDriveSwitchAccountAction')}
          </Text>
        </InputRowButton>
      )}
      {connected && (
        <InputRowButton
          label={i18n.t('googleDriveDisconnect')}
          onPress={disconnect}
          disabled={busy}
          lastInSection
        >
          <Text style={{ color: theme.colors.error }}>
            {i18n.t('googleDriveDisconnectAction')}
          </Text>
        </InputRowButton>
      )}
    </Section>
  )
}

export default GoogleDriveAccountSection
