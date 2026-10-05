import type { PropsWithChildren } from 'react'
import { Platform, View, type ViewProps } from 'react-native'
import { requireNativeView, requireOptionalNativeModule } from 'expo'

export type PointerAccessory = 'left' | 'right' | 'up' | 'down'

type Props = PropsWithChildren<
  ViewProps & {
    /** Arrows shown beside the iPad pointer while it's over this view. */
    accessories?: PointerAccessory[]
  }
>

// Older binaries and other platforms render a plain View.
const NativeView =
  Platform.OS === 'ios' && requireOptionalNativeModule('PointerStyle')
    ? requireNativeView<Props>('PointerStyle')
    : null

export default function PointerStyleView({ accessories, ...props }: Props) {
  if (!NativeView) return <View {...props} />
  return <NativeView accessories={accessories ?? []} {...props} />
}
