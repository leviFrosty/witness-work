import { StyleSheet, View } from 'react-native'
import { WifiOff } from 'lucide-react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { useOnline } from '@/lib/http/online'
import i18n from '@/lib/locales'
import { offlineBannerShows } from '@/lib/webOffline/offlineState'
import { usePreferences } from '@/stores/preferences'

/**
 * Web: ADR 0037 §6's banner. A strip above the app while the browser is offline
 * or Cloud Sync's last try failed for the network's reason, gone when the
 * connection is back and a try works. It pushes the app down rather than
 * covering it, so nothing under it (a sheet's Submit, say) is out of reach.
 * Edits stay on this device meanwhile; Cloud Sync sends them on its own.
 */
export default function OfflineBanner() {
  const theme = useTheme()
  const online = useOnline()
  const syncIssue = usePreferences((s) => s.iCloudSyncIssue)
  const syncErrorCode = usePreferences((s) => s.iCloudSyncErrorCode)
  if (!offlineBannerShows({ online, syncIssue, syncErrorCode })) return null
  return (
    <View
      accessibilityRole='alert'
      testID='offline-banner'
      style={[
        styles.banner,
        {
          backgroundColor: theme.colors.card,
          borderBottomColor: theme.colors.border,
        },
      ]}
    >
      <WifiOff size={20} color={theme.colors.textAlt} />
      <Text style={{ flex: 1, fontSize: theme.fontSize('sm'), lineHeight: 18 }}>
        {i18n.t('webOffline_banner')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
})
