import { Alert } from 'react-native'
import i18n, { type TranslationKey } from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import {
  connectGoogleDrive,
  type GoogleDriveConnectOutcome,
} from '@/lib/syncTransport/googleDrive/googleDriveAuth'

export type GoogleDriveConnectSource = 'settings' | 'onboarding' | 'reconnect'

const FAILURE_MESSAGES: Partial<
  Record<GoogleDriveConnectOutcome, TranslationKey>
> = {
  network: 'googleDriveConnectFailed_network',
  scopeDenied: 'googleDriveConnectFailed_scopeDenied',
  unavailable: 'googleDriveConnectFailed_unavailable',
}

export async function connectGoogleDriveFromUser({
  source,
  selectAccount = false,
}: {
  source: GoogleDriveConnectSource
  selectAccount?: boolean
}): Promise<boolean> {
  const outcome = await connectGoogleDrive({ selectAccount })
  analytics.capture('google_drive_connect_outcome', {
    source,
    outcome,
    switch_account: selectAccount,
  })
  if (outcome === 'connected') return true
  if (outcome !== 'canceled') {
    Alert.alert(
      i18n.t('googleDriveConnectFailed_title'),
      i18n.t(FAILURE_MESSAGES[outcome] ?? 'googleDriveConnectFailed_unknown')
    )
  }
  return false
}
