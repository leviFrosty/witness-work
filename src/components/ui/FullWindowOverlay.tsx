import type { PropsWithChildren } from 'react'
import { Modal, Platform, StyleSheet, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { FullWindowOverlay as IOSFullWindowOverlay } from 'react-native-screens'
import { FoldHandled } from '@/components/ui/layout/FoldPane'
import { useAppLockSession, useAppLockSettings } from '@/stores/appLock'

type Props = PropsWithChildren<{
  open?: boolean

  onClose?: () => void

  interactive?: boolean
}>

export default function FullWindowOverlay({
  children,
  open = true,
  onClose,
  interactive = false,
}: Props) {
  const locked = useAppLockSession((s) => s.locked)
  const appLocked = useAppLockSettings((s) => s.enabled) && locked
  const modal = onClose !== undefined

  if (!modal && (!open || appLocked)) return null

  const content = modal ? (
    <FoldHandled value={false}>{children}</FoldHandled>
  ) : (
    <View
      collapsable={false}
      pointerEvents={interactive ? 'box-none' : 'none'}
      accessibilityElementsHidden={!interactive}
      importantForAccessibility={interactive ? 'auto' : 'no-hide-descendants'}
      style={[StyleSheet.absoluteFill, styles.decoration]}
    >
      <FoldHandled value={false}>{children}</FoldHandled>
    </View>
  )

  if (Platform.OS === 'ios') {
    return (
      <IOSFullWindowOverlay unstable_accessibilityContainerViewIsModal={modal}>
        {content}
      </IOSFullWindowOverlay>
    )
  }

  if (modal) {
    return (
      <Modal
        visible={open}
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={onClose}
      >
        <GestureHandlerRootView style={styles.gestureRoot}>
          {content}
        </GestureHandlerRootView>
      </Modal>
    )
  }

  return content
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  decoration: {
    zIndex: 1000,
    elevation: 1000,
  },
})
