import type { PropsWithChildren } from 'react'
import { StyleSheet, View } from 'react-native'
import InstallAppBanner from '@/app/web-install/InstallAppBanner'
import OfflineBanner from '@/app/web-offline/OfflineBanner'

/**
 * Web: the offline banner and the Install App banner above the whole app, which
 * then fills the rest of the window, so a banner covers nothing
 * (docs/web-offline.md).
 */
export default function WebBannersLayout({ children }: PropsWithChildren) {
  return (
    <View style={styles.fill}>
      <OfflineBanner />
      <InstallAppBanner />
      <View style={styles.fill}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({ fill: { flex: 1 } })
