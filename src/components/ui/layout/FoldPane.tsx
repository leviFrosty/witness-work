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

const FoldHandledContext = createContext(false)

export const FoldHandled = ({
  children,
  value = true,
}: {
  children: ReactNode
  value?: boolean
}) => <FoldHandledContext value={value}>{children}</FoldHandledContext>

export const useFoldHandled = () => useContext(FoldHandledContext)

type Props = {
  children: ReactNode

  style?: StyleProp<ViewStyle>

  contentStyle?: StyleProp<ViewStyle>
  pointerEvents?: 'box-none' | 'none' | 'auto' | 'box-only'
}

export default function FoldPane({
  children,
  style,
  contentStyle,
  pointerEvents = 'box-none',
}: Props) {
  const insets = useSafeAreaInsets()
  const { onRegionsChange, pane } = useLocalFoldPane()
  const rtl = isRtlLayout()

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

const FoldAreaContext = createContext<{
  width: number
  pane: { left: number; right: number } | null
} | null>(null)

export function FoldArea({ children }: { children: ReactNode }) {
  const { onRegionsChange, pane, width } = useLocalFoldPane()
  return (
    <View style={styles.fill}>
      <FoldAreaContext value={{ width, pane }}>{children}</FoldAreaContext>
      {}
      <DisplayRegionsView
        style={StyleSheet.absoluteFill}
        onRegionsChange={onRegionsChange}
      />
    </View>
  )
}

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

    start: isRtlLayout() ? right : left,
  }
}

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
