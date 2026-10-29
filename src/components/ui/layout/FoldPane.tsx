import { createContext, ReactNode, useContext, useState } from 'react'
import {
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import DisplayRegionsView, {
  type DisplayRegions,
} from '../../../../modules/display-regions'
import { isRtlLayout } from '@/lib/direction'
import { getFoldColumn, getFoldPane } from '@/lib/foldSplit'
import { useDisplayRegions } from '@/stores/displayRegions'

/**
 * True inside something that already keeps its content to one side of the fold,
 * so a column or pane within it doesn't measure and move again: two nested ones
 * would each react to the fold in turn, and text sized to fit the first squeeze
 * doesn't grow back.
 */
const FoldHandledContext = createContext(false)

/**
 * Marks its children as already kept to one side of the fold, or with `false`,
 * as covering the whole window again (an overlay).
 */
export const FoldHandled = ({
  children,
  value = true,
}: {
  children: ReactNode
  value?: boolean
}) => <FoldHandledContext value={value}>{children}</FoldHandledContext>

/** Whether this is inside something already kept to one side of the fold. */
export const useFoldHandled = () => useContext(FoldHandledContext)

type Props = {
  children: ReactNode
  /** The area it covers: its parent's flex space unless given. */
  style?: StyleProp<ViewStyle>
  /** The pane the children lay out in. */
  contentStyle?: StyleProp<ViewStyle>
  pointerEvents?: 'box-none' | 'none' | 'auto' | 'box-only'
}

/**
 * Its area clear of the side safe areas (iPhone Duo's vertical bar), and while
 * iPhone Duo is partly folded like a book, only the leading side of the fold,
 * as the system does with alerts and sheets: a dialog, form or toast centered
 * in it never sits under the bar or across the crease. Put the content in it
 * and leave a backdrop outside, so that still covers the whole window. Inside a
 * screen the side insets are already handled (`HorizontalSafeArea`), so only
 * the fold counts there.
 */
export default function FoldPane({
  children,
  style,
  contentStyle,
  pointerEvents = 'box-none',
}: Props) {
  const insets = useSafeAreaInsets()
  const { onRegionsChange, pane } = useLocalFoldPane()
  const rtl = isRtlLayout()
  // Both are physical, from the same edges; React Native mirrors margins in RTL.
  const left = Math.max(insets.left, pane?.left ?? 0)
  const right = Math.max(insets.right, pane?.right ?? 0)

  return (
    <View pointerEvents='box-none' style={style ?? styles.fill}>
      <DisplayRegionsView
        style={StyleSheet.absoluteFill}
        onRegionsChange={onRegionsChange}
      />
      <View
        pointerEvents={pointerEvents}
        style={[
          styles.fill,
          contentStyle,
          rtl
            ? { marginLeft: right, marginRight: left }
            : { marginLeft: left, marginRight: right },
        ]}
      >
        <FoldHandled>{children}</FoldHandled>
      </View>
    </View>
  )
}

/**
 * The pane for a layout that applies it itself, such as a header row or a
 * centered column: put a `DisplayRegionsView` with `onRegionsChange` over the
 * area, unpadded, and keep the content within `pane`, the physical inset from
 * each edge (null while the display is flat or the fold misses the area).
 */
export function useLocalFoldPane() {
  const handled = useContext(FoldHandledContext)
  const [regions, setRegions] = useState<DisplayRegions | null>(null)
  const pane =
    regions && !handled
      ? getFoldPane({
          width: regions.width,
          divisions: regions.divisions,
          rtl: isRtlLayout(),
        })
      : null
  return { onRegionsChange: setRegions, pane, width: regions?.width ?? 0 }
}

/** A screen's area and its pane, from the `FoldArea` around the screen. */
const FoldAreaContext = createContext<{
  width: number
  pane: { left: number; right: number } | null
} | null>(null)

/**
 * Measures a screen's area for the centered columns inside it
 * (`useFoldColumn`). `HorizontalSafeArea` puts one around every screen.
 */
export function FoldArea({ children }: { children: ReactNode }) {
  const { onRegionsChange, pane, width } = useLocalFoldPane()
  return (
    <View style={styles.fill}>
      <FoldAreaContext value={{ width, pane }}>{children}</FoldAreaContext>
      {/* Last, so a screen's own content stays its first child. */}
      <DisplayRegionsView
        style={StyleSheet.absoluteFill}
        onRegionsChange={onRegionsChange}
      />
    </View>
  )
}

/**
 * For a column centered across the screen (`width: '100%'`, `maxWidth`,
 * `alignSelf: 'center'`): while iPhone Duo is partly folded, the style that
 * centers it in the pane on the leading side of the fold instead, to put after
 * its own. Null while the display is flat, inside something that already keeps
 * to one side, or for `maxWidth` null (a layout that meets the fold itself,
 * such as a `FoldSplit`). Only for a column whose container spans the screen.
 */
export function useFoldColumn(
  maxWidth: number | null | undefined
): ViewStyle | null {
  const area = useContext(FoldAreaContext)
  const handled = useContext(FoldHandledContext)
  if (maxWidth == null || !area || handled) return null
  const column = getFoldColumn({
    width: area.width,
    pane: area.pane,
    maxWidth,
    rtl: isRtlLayout(),
  })
  return (
    column && {
      alignSelf: 'flex-start',
      width: column.width,
      maxWidth: column.width,
      marginStart: column.start,
    }
  )
}

/**
 * The same pane across the whole window, as a physical `x` and `width`, for an
 * overlay that sizes and places its content by number (a card that grows to
 * fill the window, a sheet of its own).
 */
export function useWindowFoldPane() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const regions = useDisplayRegions((s) => s.regions)
  const pane = regions
    ? getFoldPane({
        width: regions.width,
        divisions: regions.divisions,
        rtl: isRtlLayout(),
      })
    : null
  const left = Math.max(insets.left, pane?.left ?? 0)
  const right = Math.max(insets.right, pane?.right ?? 0)
  return {
    x: left,
    width: Math.max(0, width - left - right),
    /** The distance from the window's reading-order start: a mirrored `left`. */
    start: isRtlLayout() ? right : left,
  }
}

/**
 * `useFoldColumn` for a column centered across the whole window, outside any
 * screen (a takeover): centered in the window's pane, clear of the vertical bar
 * and on one side of the fold. Null when nothing is reserved.
 */
export function useWindowFoldColumn(maxWidth: number): ViewStyle | null {
  const pane = useWindowFoldPane()
  const { width } = useWindowDimensions()
  if (pane.width >= width) return null
  const columnWidth = Math.min(maxWidth, pane.width)
  return {
    alignSelf: 'flex-start',
    width: columnWidth,
    maxWidth: columnWidth,
    marginStart: Math.round(pane.start + (pane.width - columnWidth) / 2),
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
