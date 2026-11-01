import { I18nManager, Platform, View, type ViewProps } from 'react-native'
import { requireNativeView, requireOptionalNativeModule } from 'expo'

export type WindowControlsInsets = { start: number; end: number }

export const NO_WINDOW_CONTROLS: WindowControlsInsets = { start: 0, end: 0 }

type NativeProps = ViewProps & {
  onInsetsChange: (event: {
    nativeEvent: { left: number; right: number }
  }) => void
}

const NativeView =
  Platform.OS === 'ios' &&
  Platform.isPad &&
  requireOptionalNativeModule('WindowControls')
    ? requireNativeView<NativeProps>('WindowControls')
    : null

export default function WindowControlsInsetView({
  onInsetsChange,
  ...props
}: ViewProps & {
  onInsetsChange: (insets: WindowControlsInsets) => void
}) {
  if (!NativeView) return <View {...props} />
  return (
    <NativeView
      {...props}
      onInsetsChange={({ nativeEvent: { left, right } }) => {
        const [start, end] = I18nManager.isRTL ? [right, left] : [left, right]
        onInsetsChange({ start: Math.ceil(start), end: Math.ceil(end) })
      }}
    />
  )
}
