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

/** How wide a form sheet is when it fits its content. */
const FORM_SHEET_WIDTH = 540
/** Clears the grabber, which sits over the top of the sheet's content. */
const GRABBER_INSET = 10
/** Keeps the tallest content clear of the screen's top edge. */
const TOP_GAP = 24

const detent = (point: SheetSnapPoint): PresentationDetent =>
  point === 'half' ? 'medium' : point === 'full' ? 'large' : point

/**
 * SwiftUI's `.sheet`, built on `@expo/ui/swift-ui` rather than the universal
 * `BottomSheet`, which doesn't report when the dismissal finishes or let an
 * iPad form sheet fit its content.
 */
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
  // Content that fits sizes itself, so it needs the sheet's width up front.
  // A sheet spans the window, even when iOS 26 floats a short one (it scales
  // the whole sheet down rather than narrowing it), less the side safe areas
  // it keeps its content out of (iPhone Duo's vertical bar). A regular-width
  // window (iPad, or iPhone Duo open) shows a form sheet instead, as wide as
  // its content. Builds without the size class fall back to the iPad idiom.
  const regularWidth = useDisplayRegions((s) =>
    s.regions
      ? s.regions.horizontalSizeClass === 'regular'
      : Platform.OS === 'ios' && Platform.isPad
  )
  const width =
    regularWidth && window.width >= 600
      ? Math.min(window.width, FORM_SHEET_WIDTH)
      : window.width - sides.left - sides.right
  // Content that fits is kept above the keyboard, where the sheet rides, so
  // a tall form scrolls instead of running under it.
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
  // Where the content is on screen (scaled, if iOS draws the sheet smaller),
  // and the width it's laid out at, for popovers anchored inside it.
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
            // iPad ignores detents: content with snap points fills a page-sized
            // sheet there, and content that fits gets a sheet its own size.
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
