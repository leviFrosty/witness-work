import { StyleSheet, View } from 'react-native'
import { WifiOff } from 'lucide-react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { useOnline } from '@/lib/http/online'
import i18n from '@/lib/locales'
import { offlineBannerShows } from '@/lib/webOffline/offlineState'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePreferences } from '@/stores/preferences'

export function useOfflineBannerShows() {
  const online = useOnline()
  const syncIssue = usePreferences((s) => s.iCloudSyncIssue)
  const syncErrorCode = usePreferences((s) => s.iCloudSyncErrorCode)
  return offlineBannerShows({ online, syncIssue, syncErrorCode })
}

export default function OfflineBanner() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  if (!useOfflineBannerShows()) return null
  return (
    <View
      accessibilityRole='alert'
      testID='offline-banner'
      style={[
        styles.banner,
        {
          paddingTop: insets.top + PADDING_VERTICAL,
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

const PADDING_VERTICAL = 10

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: PADDING_VERTICAL,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
})
