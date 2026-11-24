import { createElement, useEffect, useRef, useState } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { BottomSheet, RNHostView } from '@expo/ui'
import DialogSheet from '@/components/ui/web/DialogSheet'
import FocusGuard from '@/components/ui/web/FocusGuard'
import { focusLast } from '@/components/ui/web/focusTrap'
import { useSheetName } from '@/components/ui/web/sheetName'
import type { NativeSheetProps } from '@/components/ui/Sheet.types'

const DIALOG_MIN_WIDTH = 768

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
  const dialogRef = useRef<HTMLElement | null>(null)
  useSheetName(content, accessibilityLabel)
  useEffect(() => {
    if (!open) onClosed()
  }, [open, onClosed])

  useEffect(() => {
    if (!open) return
    const dialog = content.current?.closest('dialog') ?? null
    dialogRef.current = dialog
    if (!dialog) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Tab' &&
        event.shiftKey &&
        document.activeElement === dialog
      ) {
        event.preventDefault()
        if (content.current) focusLast(content.current, dialog)
      }
    }
    dialog.addEventListener('keydown', onKeyDown)
    return () => dialog.removeEventListener('keydown', onKeyDown)
  }, [open])

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
      {}
      <RNHostView matchContents={{ vertical: !snapPoints?.length }}>
        {createElement(
          'div',
          { style: { display: 'contents' } },
          <FocusGuard
            edge='start'
            active={open}
            containerRef={content}
            fallbackRef={dialogRef}
          />,
          createElement(
            'div',
            { ref: content, style: { display: 'contents' } },
            <View style={{ flex: 1 }}>{children}</View>
          ),
          <FocusGuard
            edge='end'
            active={open}
            containerRef={content}
            fallbackRef={dialogRef}
          />
        )}
      </RNHostView>
    </BottomSheet>
  )
}
