import { I18nManager, Platform, View, type ViewProps } from 'react-native'
import { requireNativeView, requireOptionalNativeModule } from 'expo'

/** Room iPadOS window controls take from a view's leading and trailing edges. */
export type WindowControlsInsets = { start: number; end: number }

export const NO_WINDOW_CONTROLS: WindowControlsInsets = { start: 0, end: 0 }

type NativeProps = ViewProps & {
  onInsetsChange: (event: {
    nativeEvent: { left: number; right: number }
  }) => void
}

// Only iPad windows have controls. Older binaries render a plain View.
const NativeView =
  Platform.OS === 'ios' &&
  Platform.isPad &&
  requireOptionalNativeModule('WindowControls')
    ? requireNativeView<NativeProps>('WindowControls')
    : null

/**
 * A View that reports how far the window controls reach into it, so a header
 * can move its corner button clear of them. Measures its own frame, so pad its
 * content rather than the view itself.
 */
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
        // The controls sit on a physical side; layout pads leading/trailing.
        const [start, end] = I18nManager.isRTL ? [right, left] : [left, right]
        onInsetsChange({ start: Math.ceil(start), end: Math.ceil(end) })
      }}
    />
  )
}
