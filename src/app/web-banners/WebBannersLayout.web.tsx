import type { PropsWithChildren } from 'react'
import { StyleSheet, View } from 'react-native'
import InstallAppBanner from '@/app/web-install/InstallAppBanner'
import OfflineBanner from '@/app/web-offline/OfflineBanner'

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
