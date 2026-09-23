import type { PropsWithChildren } from 'react'
import { Modal, Platform, StyleSheet, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { FullWindowOverlay as IOSFullWindowOverlay } from 'react-native-screens'

type Props = PropsWithChildren<{
  open?: boolean
  onClose?: () => void
}>

/**
 * Keep interactive overlays above navigation and decorations out of hit
 * testing.
 */
export default function FullWindowOverlay({
  children,
  open = true,
  onClose,
}: Props) {
  if (Platform.OS === 'ios') {
    return <IOSFullWindowOverlay>{children}</IOSFullWindowOverlay>
  }

  if (onClose) {
    return (
      <Modal
        visible={open}
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={onClose}
      >
        <GestureHandlerRootView style={styles.gestureRoot}>
          {children}
        </GestureHandlerRootView>
      </Modal>
    )
  }

  return open ? (
    <View
      pointerEvents='none'
      style={[StyleSheet.absoluteFill, styles.decoration]}
    >
      {children}
    </View>
  ) : null
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
