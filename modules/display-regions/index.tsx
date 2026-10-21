import { Platform, View, type ViewProps } from 'react-native'
import { requireNativeView, requireOptionalNativeModule } from 'expo'

export type DisplayRect = {
  x: number
  y: number
  width: number
  height: number
}

/** A fold, in the reporting view's coordinates. Inactive while flat. */
export type DisplayDivision = DisplayRect & { active: boolean }

export type DisplayRegions = {
  width: number
  height: number
  horizontalSizeClass: 'compact' | 'regular' | 'unspecified'
  /**
   * The physical side where iPhone Duo puts its vertical bar (status bar,
   * toolbars and tab bars), or null where bars stay horizontal.
   */
  verticalBarEdge: 'left' | 'right' | null
  divisions: DisplayDivision[]
}

type Props = ViewProps & {
  /** Called on mount and whenever a region, the edge or the size class changes. */
  onRegionsChange: (regions: DisplayRegions) => void
}

type NativeProps = ViewProps & {
  onRegionsChange: (event: { nativeEvent: DisplayRegions }) => void
}

// Older binaries and other platforms render a plain View and never report.
const NativeView =
  Platform.OS === 'ios' && requireOptionalNativeModule('DisplayRegions')
    ? requireNativeView<NativeProps>('DisplayRegions')
    : null

export const supportsDisplayRegions = NativeView !== null

/**
 * Reports iPhone Duo's reserved regions in its own coordinates. Place it where
 * the content it positions is, e.g. filling a split's container.
 */
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
