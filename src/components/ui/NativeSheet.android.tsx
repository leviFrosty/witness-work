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

const SHEET_MAX_WIDTH = 640

const DRAG_HANDLE = { top: 10, bar: 4, bottom: 6 }
const DRAG_HANDLE_HEIGHT =
  DRAG_HANDLE.top + DRAG_HANDLE.bar + DRAG_HANDLE.bottom

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

  const [windowFrame, setWindowFrame] = useState<SheetWindowFrame | null>(null)
  const latestOnClosed = useRef(onClosed)
  useEffect(() => {
    latestOnClosed.current = onClosed
  })

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
        {}
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

const fraction = (point: SheetSnapPoint, screenHeight: number) => {
  if (point === 'half') return 0.5
  if (point === 'full') return 1
  if ('fraction' in point) return point.fraction
  return point.height / screenHeight
}
