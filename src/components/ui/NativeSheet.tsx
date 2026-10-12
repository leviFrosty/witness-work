import { useEffect } from 'react'
import { View } from 'react-native'
import { BottomSheet, RNHostView } from '@expo/ui'
import type { NativeSheetProps } from '@/components/ui/Sheet.types'

/**
 * The universal `BottomSheet`, for platforms without their own
 * `NativeSheet.*.tsx`. It can't report when a dismissal finishes, so the sheet
 * counts as closed as soon as it starts to close.
 */
export default function NativeSheet({
  open,
  onDismiss,
  onClosed,
  snapPoints,
  backgroundColor,
  testID,
  children,
}: NativeSheetProps) {
  useEffect(() => {
    if (!open) onClosed()
  }, [open, onClosed])

  return (
    <BottomSheet
      isPresented={open}
      onDismiss={onDismiss}
      snapPoints={snapPoints}
      contentPadding={0}
      containerColor={backgroundColor}
      testID={testID}
    >
      <RNHostView matchContents={!snapPoints?.length}>
        <View style={{ flex: 1 }}>{children}</View>
      </RNHostView>
    </BottomSheet>
  )
}
