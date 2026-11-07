import { createElement, useEffect, useRef, useState } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { BottomSheet, RNHostView } from '@expo/ui'
import DialogSheet from '@/components/ui/web/DialogSheet'
import { trapTab } from '@/components/ui/web/focusTrap'
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
  useSheetName(content, accessibilityLabel)
  useEffect(() => {
    if (!open) onClosed()
  }, [open, onClosed])

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
        {}
        {createElement(
          'div',
          { ref: content, style: { display: 'contents' }, onKeyDown: trapTab },
          <View style={{ flex: 1 }}>{children}</View>
        )}
      </RNHostView>
    </BottomSheet>
  )
}
