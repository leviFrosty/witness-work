import { type ReactNode, useEffect, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import {
  type EdgeInsets,
  type Rect,
  SafeAreaListener,
  useSafeAreaFrame,
} from 'react-native-safe-area-context'
import { SafeAreaView } from 'react-native-screens/experimental'
import { setTabBarInsets } from '@/stores/tabBarInsets'

const ANDROID_EDGES = { bottom: true } as const

/**
 * Wraps each tab. Android ends the tab above its opaque navigation bar, while
 * iOS lets content run under its translucent tab bar, and the iPad sidebar
 * float over it. The focused tab measures the room the bar leaves, for
 * `useTabBarInsets`, and keeps content clear of the sidebar.
 */
export default function TabScreenLayout({ children }: { children: ReactNode }) {
  const isFocused = useIsFocused()
  // The app's root safe area: the whole window.
  const windowFrame = useSafeAreaFrame()
  const [safeArea, setSafeArea] = useState<{
    insets: EdgeInsets
    frame: Rect
  }>()

  useEffect(() => {
    // A tab in the background can be detached and measure nothing.
    if (!isFocused || !safeArea) return
    const { insets, frame } = safeArea
    const belowTab = Math.max(
      0,
      windowFrame.y + windowFrame.height - (frame.y + frame.height)
    )
    setTabBarInsets({
      top: insets.top,
      bottom: insets.bottom,
      windowBottom: belowTab + insets.bottom,
      width: frame.width - insets.left - insets.right,
    })
  }, [isFocused, safeArea, windowFrame])

  const content = (
    <>
      <View
        style={[
          styles.fill,
          {
            paddingLeft: safeArea?.insets.left,
            paddingRight: safeArea?.insets.right,
          },
        ]}
      >
        {children}
      </View>
      {/* Measures the whole tab, under the sidebar too. Its own
          `pointerEvents` is ignored on Android, where it would take every
          touch meant for the tab. */}
      <View
        collapsable={false}
        pointerEvents='none'
        style={StyleSheet.absoluteFill}
      >
        <SafeAreaListener
          style={StyleSheet.absoluteFill}
          onChange={setSafeArea}
        />
      </View>
    </>
  )

  if (Platform.OS !== 'android') return content

  return (
    <SafeAreaView
      // https://github.com/software-mansion/react-native-screens/issues/2662#issuecomment-2757735088
      collapsable={false}
      edges={ANDROID_EDGES}
      style={styles.fill}
    >
      {content}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({ fill: { flex: 1 } })
