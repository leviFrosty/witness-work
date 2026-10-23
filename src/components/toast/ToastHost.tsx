import { useEffect } from 'react'
import { AppState, Platform, StyleSheet, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useReducedMotion } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import { TAB_BAR_HEIGHT } from '@/components/ui/TabBar'
import ToastStack from '@/components/toast/ToastStack'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import useScreenReaderEnabled from '@/hooks/useScreenReaderEnabled'
import { useTabBarHidden } from '@/stores/tabBarVisibility'
import { useTakeover } from '@/stores/takeover'
import {
  toast as toasts,
  toastPlacement,
  useToasts,
  type Toast,
} from '@/stores/toasts'

/**
 * Mount once near the app root: draws every toast (`docs/toasts.md`). The
 * User's own action answers at the bottom, above the tab bar; unlocks and news
 * stack at the top, below the status bar, and wait while a takeover holds the
 * screen. An unlock or news toast still showing when the app goes to the
 * background leaves, and its feature's tray item keeps it.
 */
export default function ToastHost() {
  const items = useToasts((s) => s.toasts)
  const takingOver = useTakeover((s) => s.arbiter.active !== null)
  // Read here, where it's always mounted, so it's known when a toast shows.
  const screenReader = useScreenReaderEnabled()
  const reduceMotion = useReducedMotion()
  const insets = useSafeAreaInsets()
  const { hasBottomBar } = useAdaptiveLayout()
  const tabBarHidden = useTabBarHidden()

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'background') return
      for (const item of useToasts.getState().toasts)
        if (toastPlacement(item.intent) === 'top')
          toasts.dismiss(item.id, 'background')
    })
    return () => subscription.remove()
  }, [])

  // Mounted only while there's a toast: an idle window-level overlay can
  // interfere with native sheets (see PointerTooltipLayer).
  if (!items.length) return null

  const top: Toast[] = []
  const bottom: Toast[] = []
  for (const item of items)
    (toastPlacement(item.intent) === 'top' ? top : bottom).push(item)
  const side = Math.max(insets.left, insets.right)

  const content = (
    <View
      pointerEvents='box-none'
      style={[
        StyleSheet.absoluteFill,
        { zIndex: 1000, elevation: 1000, paddingHorizontal: side },
      ]}
    >
      {top.length > 0 && (
        <ToastStack
          placement='top'
          items={top}
          hidden={takingOver}
          inset={insets.top + 6}
          reduceMotion={reduceMotion}
          screenReader={screenReader}
        />
      )}
      {bottom.length > 0 && (
        <ToastStack
          placement='bottom'
          items={bottom}
          hidden={false}
          // Above the floating tab bar, when there is one.
          inset={
            insets.bottom +
            (hasBottomBar && !tabBarHidden ? TAB_BAR_HEIGHT : 0) +
            16
          }
          reduceMotion={reduceMotion}
          screenReader={screenReader}
        />
      )}
    </View>
  )
  // Over the window on iOS, so it shows above sheets and the one that just
  // closed while it animates away. A window of its own needs its own gesture
  // root for the swipes and taps.
  return Platform.OS === 'ios' ? (
    <FullWindowOverlay interactive>
      <GestureHandlerRootView
        pointerEvents='box-none'
        style={StyleSheet.absoluteFill}
      >
        {content}
      </GestureHandlerRootView>
    </FullWindowOverlay>
  ) : (
    content
  )
}
