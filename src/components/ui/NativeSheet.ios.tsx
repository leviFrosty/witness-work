import { useEffect, useState } from 'react'
import { Keyboard, Platform, useWindowDimensions } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Host } from '@expo/ui'
import { BottomSheet, Group, RNHostView } from '@expo/ui/swift-ui'
import {
  interactiveDismissDisabled,
  onGeometryChange,
  presentationBackground,
  presentationDetents,
  presentationDragIndicator,
  presentationSizing,
  type PresentationDetent,
} from '@expo/ui/swift-ui/modifiers'
import type {
  NativeSheetProps,
  SheetSnapPoint,
} from '@/components/ui/Sheet.types'
import { SheetWindowFrameContext } from '@/components/ui/sheetWindowFrame'
import { useDisplayRegions } from '@/stores/displayRegions'
import { useWindowSideInsets } from '@/components/ui/layout/HorizontalSafeArea'

type Frame = { x: number; y: number; width: number }

const FORM_SHEET_WIDTH = 540

const GRABBER_INSET = 10

const TOP_GAP = 24

const detent = (point: SheetSnapPoint): PresentationDetent =>
  point === 'half' ? 'medium' : point === 'full' ? 'large' : point

export default function NativeSheet({
  open,
  onDismiss,
  onClosed,
  snapPoints,
  dismissible,
  backgroundColor,
  colorScheme,
  testID,
  children,
}: NativeSheetProps) {
  const window = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const sides = useWindowSideInsets()
  const fit = !snapPoints?.length

  const regularWidth = useDisplayRegions((s) =>
    s.regions
      ? s.regions.horizontalSizeClass === 'regular'
      : Platform.OS === 'ios' && Platform.isPad
  )
  const width =
    regularWidth && window.width >= 600
      ? Math.min(window.width, FORM_SHEET_WIDTH)
      : window.width - sides.left - sides.right

  const [keyboardTop, setKeyboardTop] = useState(
    () => Keyboard.metrics()?.screenY ?? null
  )
  useEffect(() => {
    const subscriptions = [
      Keyboard.addListener('keyboardWillChangeFrame', (event) =>
        setKeyboardTop(event.endCoordinates.screenY)
      ),
      Keyboard.addListener('keyboardWillHide', () => setKeyboardTop(null)),
    ]
    return () => subscriptions.forEach((subscription) => subscription.remove())
  }, [])
  const bottomInset = Math.max(
    insets.bottom,
    keyboardTop === null ? 0 : window.height - keyboardTop
  )

  const [frame, setFrame] = useState<Frame>()
  const [contentWidth, setContentWidth] = useState<number>()
  const windowFrame =
    frame && contentWidth
      ? { x: frame.x, y: frame.y, scale: frame.width / contentWidth }
      : null

  return (
    <Host
      style={{ position: 'absolute' }}
      pointerEvents='none'
      colorScheme={colorScheme}
    >
      <BottomSheet
        isPresented={open}
        onIsPresentedChange={(presented) => {
          if (!presented) onDismiss()
        }}
        onDismiss={onClosed}
        fitToContents={fit}
      >
        <Group
          modifiers={[
            presentationDragIndicator(dismissible ? 'visible' : 'hidden'),
            interactiveDismissDisabled(!dismissible),
            presentationBackground(backgroundColor),

            ...(snapPoints?.length
              ? [
                  presentationDetents(snapPoints.map(detent)),
                  presentationSizing('page'),
                ]
              : [presentationSizing('fitted')]),
            onGeometryChange(({ x, y, width }) =>
              setFrame((prev) =>
                prev?.x === x && prev.y === y && prev.width === width
                  ? prev
                  : { x, y, width }
              )
            ),
          ]}
        >
          <RNHostView matchContents={fit}>
            <GestureHandlerRootView
              testID={testID}
              onLayout={(event) =>
                setContentWidth(event.nativeEvent.layout.width)
              }
              style={[
                { paddingTop: GRABBER_INSET },
                fit
                  ? {
                      width,
                      maxHeight:
                        window.height - insets.top - bottomInset - TOP_GAP,
                    }
                  : { flex: 1 },
              ]}
            >
              <SheetWindowFrameContext.Provider value={windowFrame}>
                {children}
              </SheetWindowFrameContext.Provider>
            </GestureHandlerRootView>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  )
}
