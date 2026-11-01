import { Platform, View, type ViewProps } from 'react-native'
import { requireNativeView, requireOptionalNativeModule } from 'expo'

export type DisplayRect = {
  x: number
  y: number
  width: number
  height: number
}

export type DisplayDivision = DisplayRect & { active: boolean }

export type DisplayRegions = {
  width: number
  height: number
  horizontalSizeClass: 'compact' | 'regular' | 'unspecified'

  verticalBarEdge: 'left' | 'right' | null
  divisions: DisplayDivision[]
}

type Props = ViewProps & {
  onRegionsChange: (regions: DisplayRegions) => void
}

type NativeProps = ViewProps & {
  onRegionsChange: (event: { nativeEvent: DisplayRegions }) => void
}

const NativeView =
  Platform.OS === 'ios' && requireOptionalNativeModule('DisplayRegions')
    ? requireNativeView<NativeProps>('DisplayRegions')
    : null

export const supportsDisplayRegions = NativeView !== null

export default function DisplayRegionsView({
  onRegionsChange,
  ...props
}: Props) {
  if (!NativeView) return <View pointerEvents='none' {...props} />
  return (
    <NativeView
      pointerEvents='none'
      {...props}
      onRegionsChange={(event) => onRegionsChange(event.nativeEvent)}
    />
  )
}
