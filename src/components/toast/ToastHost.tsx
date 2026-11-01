import { useEffect } from 'react'
import { AppState, Platform, StyleSheet, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useReducedMotion } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import RewardStackLayer from '@/components/reward-stack/RewardStackLayer'
import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import FoldPane from '@/components/ui/layout/FoldPane'
import { TAB_BAR_HEIGHT } from '@/components/ui/TabBar'
import ToastStack from '@/components/toast/ToastStack'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import useScreenReaderEnabled from '@/hooks/useScreenReaderEnabled'
import { useRewardStack } from '@/stores/rewardStack'
import { useTabBarHidden } from '@/stores/tabBarVisibility'
import { useTakeover } from '@/stores/takeover'
import {
  toast as toasts,
  toastPlacement,
  useToasts,
  type Toast,
} from '@/stores/toasts'

const ABOVE_TOAST = 76

export default function ToastHost() {
  const items = useToasts((s) => s.toasts)
  const takingOver = useTakeover((s) => s.arbiter.active !== null)

  const screenReader = useScreenReaderEnabled()
  const reduceMotion = useReducedMotion()
  const insets = useSafeAreaInsets()
  const { hasBottomBar } = useAdaptiveLayout()
  const tabBarHidden = useTabBarHidden()
  const rewarding = useRewardStack((s) => s.run !== null)

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'background') return
      for (const item of useToasts.getState().toasts)
        if (toastPlacement(item.intent) === 'top')
          toasts.dismiss(item.id, 'background')
    })
    return () => subscription.remove()
  }, [])

  if (!items.length && !rewarding) return null

  const top: Toast[] = []
  const bottom: Toast[] = []
  for (const item of items)
    (toastPlacement(item.intent) === 'top' ? top : bottom).push(item)
  const bottomInset =
    insets.bottom + (hasBottomBar && !tabBarHidden ? TAB_BAR_HEIGHT : 0) + 16

  const content = (
    <View
      pointerEvents='box-none'
      style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000 }]}
    >
      {}
      <FoldPane style={StyleSheet.absoluteFill}>
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
            inset={bottomInset}
            reduceMotion={reduceMotion}
            screenReader={screenReader}
          />
        )}
        <RewardStackLayer
          slot='toast'
          anchor={{ bottom: bottomInset + ABOVE_TOAST }}
        />
      </FoldPane>
      <RewardStackLayer
        slot='card'
        anchor={{ top: insets.top + 120 }}
        compact
      />
    </View>
  )

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
