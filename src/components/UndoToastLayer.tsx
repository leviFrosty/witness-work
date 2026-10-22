import { useEffect } from 'react'
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import { TAB_BAR_HEIGHT } from '@/components/ui/TabBar'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import useScreenReaderEnabled from '@/hooks/useScreenReaderEnabled'
import { undoToastDuration } from '@/lib/undoToastDuration'
import { hideUndoToast, useUndoToast, type UndoToast } from '@/stores/undoToast'

/** Mount once near the app root; draws the Undo toast while one is showing. */
export default function UndoToastLayer() {
  const toast = useUndoToast((s) => s.toast)
  // Read here, where it's always mounted, so it's known when a toast shows.
  const screenReader = useScreenReaderEnabled()
  if (!toast) return null
  // Mounted only while visible: an idle window-level overlay can interfere
  // with native sheets (see PointerTooltipLayer). Over the window on iOS, so
  // it shows while the sheet that logged it is still closing.
  const content = (
    <PlacedToast key={toast.id} toast={toast} screenReader={screenReader} />
  )
  return Platform.OS === 'ios' ? (
    <FullWindowOverlay interactive>{content}</FullWindowOverlay>
  ) : (
    content
  )
}

function PlacedToast({
  toast,
  screenReader,
}: {
  toast: UndoToast
  screenReader: boolean
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { hasBottomBar } = useAdaptiveLayout()

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(toast.message)
  }, [toast])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    void undoToastDuration(screenReader).then((ms) => {
      if (!cancelled) timer = setTimeout(() => hideUndoToast(toast.id), ms)
    })
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [toast, screenReader])

  return (
    <View
      pointerEvents='box-none'
      style={[
        StyleSheet.absoluteFill,
        styles.placement,
        {
          // Above the floating tab bar, when there is one.
          paddingBottom:
            insets.bottom + (hasBottomBar ? TAB_BAR_HEIGHT : 0) + 16,
        },
      ]}
    >
      <Animated.View
        entering={FadeInDown.duration(200)}
        testID='undo-toast'
        style={[
          styles.toast,
          {
            backgroundColor: theme.colors.text,
            borderRadius: theme.numbers.borderRadiusMd,
          },
        ]}
      >
        <Text
          numberOfLines={2}
          style={{
            flexShrink: 1,
            color: theme.colors.textInverse,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {toast.message}
        </Text>
        <Button
          noTransform
          testID='undo-toast-undo'
          accessibilityRole='button'
          accessibilityLabel={i18n.t('undo')}
          onPress={() => {
            hideUndoToast(toast.id)
            toast.onUndo()
          }}
          hitSlop={8}
          style={{ paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Text
            style={{
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.semiBold,
              textDecorationLine: 'underline',
            }}
          >
            {i18n.t('undo')}
          </Text>
        </Button>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  placement: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 1000,
    elevation: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 480,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 6,
  },
})
