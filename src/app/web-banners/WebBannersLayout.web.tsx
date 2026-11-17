import type { PropsWithChildren } from 'react'
import { StyleSheet, View } from 'react-native'
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from 'react-native-safe-area-context'
import InstallAppBanner from '@/app/web-install/InstallAppBanner'
import OfflineBanner, {
  useOfflineBannerShows,
} from '@/app/web-offline/OfflineBanner'

export default function WebBannersLayout({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets()
  const offline = useOfflineBannerShows()
  return (
    <View style={styles.fill}>
      <OfflineBanner />
      <InstallAppBanner />
      <View style={styles.fill}>
        {offline && insets.top > 0 ? (
          <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
            {children}
          </SafeAreaInsetsContext.Provider>
        ) : (
          children
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({ fill: { flex: 1 } })
