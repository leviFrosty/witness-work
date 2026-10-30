import { createElement, useEffect, useRef, useState } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { BottomSheet, RNHostView } from '@expo/ui'
import DialogSheet from '@/components/ui/web/DialogSheet'
import { trapTab } from '@/components/ui/web/focusTrap'
import { useSheetName } from '@/components/ui/web/sheetName'
import type { NativeSheetProps } from '@/components/ui/Sheet.types'

/** From this window width a sheet is a centered dialog, not a bottom sheet. */
const DIALOG_MIN_WIDTH = 768

/**
 * The web's sheet: a bottom sheet in a narrow window, where it sits under the
 * thumb, and a centered dialog in a wide one, where a sheet across the whole
 * window would stretch (`web/DialogSheet.tsx`). Like the universal one it can't
 * report when a bottom sheet finishes closing, so that counts as closed as soon
 * as it starts to close.
 */
export default function NativeSheet(props: NativeSheetProps) {
  const { width } = useWindowDimensions()
  return width >= DIALOG_MIN_WIDTH ? (
    <DialogSheet {...props} />
  ) : (
    <BottomSheetOnPhone {...props} />
  )
}

function BottomSheetOnPhone({
  open,
  onDismiss,
  onClosed,
  snapPoints,
  backgroundColor,
  accessibilityLabel,
  testID,
  children,
}: NativeSheetProps) {
  const content = useRef<HTMLDivElement>(null)
  useSheetName(content, accessibilityLabel)
  useEffect(() => {
    if (!open) onClosed()
  }, [open, onClosed])

  // The sheet is gone the moment it starts to close, which the browser doesn't
  // take as the dialog closing: give focus back to what opened it ourselves.
  const [opener] = useState(() => document.activeElement)
  useEffect(
    () => () => {
      setTimeout(() => {
        if (opener instanceof HTMLElement && opener.isConnected)
          opener.focus({ preventScroll: true })
      })
    },
    [opener]
  )

  return (
    <BottomSheet
      isPresented={open}
      onDismiss={onDismiss}
      snapPoints={snapPoints}
      contentPadding={0}
      containerColor={backgroundColor}
      testID={testID}
    >
      {/* The sheet's full width, as tall as its content unless it has snap points. */}
      <RNHostView matchContents={{ vertical: !snapPoints?.length }}>
        {/* No box of its own: only a place to catch Tab inside the dialog. */}
        {createElement(
          'div',
          { ref: content, style: { display: 'contents' }, onKeyDown: trapTab },
          <View style={{ flex: 1 }}>{children}</View>
        )}
      </RNHostView>
    </BottomSheet>
  )
}
