import { useEffect, useRef, useState } from 'react'
import { useWindowDimensions } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Host } from '@expo/ui'
import {
  Box,
  Column,
  ModalBottomSheet,
  RNHostView,
  type ModalBottomSheetRef,
} from '@expo/ui/jetpack-compose'
import {
  background,
  clip,
  fillMaxSize,
  onGloballyPositioned,
  padding,
  Shapes,
  size,
} from '@expo/ui/jetpack-compose/modifiers'
import useTheme from '@/contexts/theme'
import type {
  NativeSheetProps,
  SheetSnapPoint,
} from '@/components/ui/Sheet.types'
import {
  SheetWindowFrameContext,
  type SheetWindowFrame,
} from '@/components/ui/sheetWindowFrame'

/** Material 3 caps a bottom sheet's width at 640dp. */
const SHEET_MAX_WIDTH = 640
/**
 * The drag handle's bar and the room above and below it. Material's default
 * band is 48dp; this keeps content as close under the handle as it sat before
 * sheets went native.
 */
const DRAG_HANDLE = { top: 10, bar: 4, bottom: 6 }
const DRAG_HANDLE_HEIGHT =
  DRAG_HANDLE.top + DRAG_HANDLE.bar + DRAG_HANDLE.bottom

/**
 * Material 3's `ModalBottomSheet`, built on `@expo/ui/jetpack-compose` rather
 * than the universal `BottomSheet`, which doesn't report when a sheet closed by
 * the app has finished hiding, and opens a tall sheet at half height even when
 * it should fit its content.
 *
 * Material has only two resting heights, half and full: a sheet whose lowest
 * snap point is half the screen or less opens at half height and drags up to
 * full; any other sheet with snap points opens at full height.
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
  const theme = useTheme()
  const window = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const sheet = useRef<ModalBottomSheetRef>(null)
  // Where the content is on screen, for popovers anchored inside it.
  const [windowFrame, setWindowFrame] = useState<SheetWindowFrame | null>(null)
  const latestOnClosed = useRef(onClosed)
  useEffect(() => {
    latestOnClosed.current = onClosed
  })

  // Closed by the app or after the User dismissed it: wait out the hide
  // animation (already over after a dismissal) before saying it's closed.
  useEffect(() => {
    if (open) return
    let cancelled = false
    void (sheet.current?.hide() ?? Promise.resolve()).then(() => {
      if (!cancelled) latestOnClosed.current()
    })
    return () => {
      cancelled = true
    }
  }, [open])

  const fit = !snapPoints?.length
  const opensHalfway =
    !fit && snapPoints.some((point) => fraction(point, window.height) <= 0.5)

  return (
    <Host
      style={{ position: 'absolute' }}
      pointerEvents='none'
      colorScheme={colorScheme}
    >
      <ModalBottomSheet
        ref={sheet}
        onDismissRequest={onDismiss}
        skipPartiallyExpanded={!opensHalfway}
        showDragHandle={dismissible}
        sheetGesturesEnabled={dismissible}
        properties={{
          shouldDismissOnBackPress: dismissible,
          shouldDismissOnClickOutside: dismissible,
        }}
        containerColor={backgroundColor}
      >
        {dismissible ? (
          <ModalBottomSheet.DragHandle>
            <Box
              modifiers={[
                padding(0, DRAG_HANDLE.top, 0, DRAG_HANDLE.bottom),
                size(32, DRAG_HANDLE.bar),
                clip(Shapes.RoundedCorner(DRAG_HANDLE.bar / 2)),
                background(theme.colors.textAlt),
              ]}
            />
          </ModalBottomSheet.DragHandle>
        ) : null}
        {/* A Column reports where the content is: `RNHostView` itself
            doesn't deliver its modifiers' events. */}
        <Column
          modifiers={[
            ...(fit ? [] : [fillMaxSize()]),
            onGloballyPositioned(({ x, y }) =>
              setWindowFrame((prev) =>
                prev?.x === x && prev.y === y ? prev : { x, y, scale: 1 }
              )
            ),
          ]}
        >
          <RNHostView matchContents={fit}>
            <GestureHandlerRootView
              testID={testID}
              style={
                fit
                  ? {
                      width: Math.min(window.width, SHEET_MAX_WIDTH),
                      maxHeight:
                        window.height -
                        insets.top -
                        insets.bottom -
                        DRAG_HANDLE_HEIGHT,
                    }
                  : { flex: 1 }
              }
            >
              <SheetWindowFrameContext.Provider value={windowFrame}>
                {children}
              </SheetWindowFrameContext.Provider>
            </GestureHandlerRootView>
          </RNHostView>
        </Column>
      </ModalBottomSheet>
    </Host>
  )
}

/** The share of the screen a snap point covers. */
const fraction = (point: SheetSnapPoint, screenHeight: number) => {
  if (point === 'half') return 0.5
  if (point === 'full') return 1
  if ('fraction' in point) return point.fraction
  return point.height / screenHeight
}
