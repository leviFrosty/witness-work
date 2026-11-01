import type { PropsWithChildren } from 'react'
import { Platform, View, type ViewProps } from 'react-native'
import { requireNativeView, requireOptionalNativeModule } from 'expo'

export type PointerAccessory = 'left' | 'right' | 'up' | 'down'

type Props = PropsWithChildren<
  ViewProps & {
    accessories?: PointerAccessory[]
  }
>

const NativeView =
  Platform.OS === 'ios' && requireOptionalNativeModule('PointerStyle')
    ? requireNativeView<Props>('PointerStyle')
    : null

export default function PointerStyleView({ accessories, ...props }: Props) {
  if (!NativeView) return <View {...props} />
  return <NativeView accessories={accessories ?? []} {...props} />
}
