import { memo, useCallback, useMemo, useState } from 'react'
import { LayoutChangeEvent, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import Haptics from '@/lib/haptics'
import { formatMinutesCompact } from '@/lib/minutes'
import {
  ContributionCell,
  contributionGrid,
} from '@/features/profile/lib/profileStats'
import i18n from '@/lib/locales'

interface Props {
  daily: Map<string, number>
  weeks?: number
  /** Tap on a cell with non-future data fires this with the cell's date. */
  onDayPress?: (date: Date) => void
}

const GAP = 3
const MIN_CELL = 8
const MAX_CELL = 14
const LABEL_WIDTH = 22
const LABEL_GAP = 4
const POPOVER_WIDTH = 150
const POPOVER_OFFSET = 8
// Hold this long before the scrub gesture activates. Below this threshold the
// touch falls through to the tap (navigate) or to the parent scroll view.
const SCRUB_LONG_PRESS_MS = 200
const TAP_MAX_MS = 180

const hexToHsl = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let hue: number
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (max === g) hue = ((b - r) / d + 2) * 60
  else hue = ((r - g) / d + 4) * 60
  return [hue, s, l]
}

const hslToHex = (h: number, s: number, l: number): string => {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

const withSaturation = (hex: string, saturation: number): string => {
  const [h, , l] = hexToHsl(hex)
  return hslToHex(h, saturation, l)
}

const LEVEL_SATURATION: Record<1 | 2 | 3 | 4, number> = {
  1: 0.2,
  2: 0.5,
  3: 0.8,
  4: 1,
}

const levelToColor = (
  level: ContributionCell['level'],
  accent: string,
  border: string,
  future: boolean
): string => {
  if (future) return 'transparent'
  if (level === 0) return border
  return withSaturation(accent, LEVEL_SATURATION[level])
}

type CellGridProps = {
  grid: ContributionCell[][]
  cell: number
  colors: {
    accent: string
    border: string
  }
}

/**
 * Stable cell rendering. Has no hover state of its own — the hover ring is a
 * separate Reanimated overlay so scrubbing across cells never re-renders this
 * subtree. Wrapped in `memo` with referential prop equality so the parent's
 * popover state updates skip this entirely.
 */
const CellGrid = memo(({ grid, cell, colors }: CellGridProps) => {
  return (
    <View style={{ flexDirection: 'row', gap: GAP }}>
      {grid.map((col, i) => (
        <View key={`c-${i}`} style={{ gap: GAP }}>
          {col.map((cellData, j) => (
            <View
              key={`d-${i}-${j}`}
              style={{
                width: cell,
                height: cell,
                borderRadius: 2,
                backgroundColor: levelToColor(
                  cellData.level,
                  colors.accent,
                  colors.border,
                  cellData.future
                ),
              }}
            />
          ))}
        </View>
      ))}
    </View>
  )
})
CellGrid.displayName = 'CellGrid'

const ContributionGraph = ({ daily, weeks = 26, onDayPress }: Props) => {
  const theme = useTheme()
  const [width, setWidth] = useState(0)
  const [hovered, setHovered] = useState<{ col: number; row: number } | null>(
    null
  )

  const grid = useMemo(() => contributionGrid(daily, weeks), [daily, weeks])

  const cell = useMemo(() => {
    if (width <= 0) return MIN_CELL
    const gridWidth = width - LABEL_WIDTH - LABEL_GAP
    const size = Math.floor((gridWidth - (weeks - 1) * GAP) / weeks)
    return Math.max(MIN_CELL, Math.min(MAX_CELL, size))
  }, [width, weeks])

  const stride = cell + GAP
  const gridPixelWidth = weeks * cell + (weeks - 1) * GAP

  // Tracks the last cell index emitted on the UI thread so we only fire the
  // haptic + state update when the finger crosses into a new cell, not on
  // every gesture frame within the same cell.
  const lastIdx = useSharedValue(-1)
  // Hover ring transform / visibility, driven on the UI thread by the gesture
  // worklets. Avoids any React re-render of the 180+ cell grid during scrubs.
  const ringX = useSharedValue(0)
  const ringY = useSharedValue(0)
  const ringOpacity = useSharedValue(0)

  const dayLabels = useMemo(
    () =>
      [0, 1, 2, 3, 4, 5, 6].map((i) =>
        i === 1 || i === 3 || i === 5
          ? moment()
              .isoWeekday(i + 1)
              .format('ddd')
          : ''
      ),
    []
  )

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width)
    if (w && w !== width) setWidth(w)
  }

  // Memoize props passed to CellGrid so referential equality holds across
  // scrub-triggered popover re-renders.
  const cellColors = useMemo(
    () => ({ accent: theme.colors.accent, border: theme.colors.border }),
    [theme.colors.accent, theme.colors.border]
  )

  // JS-thread handlers invoked via runOnJS from gesture worklets. Kept stable
  // with useCallback so worklet closures don't churn — though gesture-handler
  // captures by value, recreating the closure on each render still allocates.
  const applyHover = useCallback(
    (col: number, row: number) => {
      const cellData = grid[col]?.[row]
      if (!cellData || cellData.future) {
        setHovered(null)
        return
      }
      setHovered({ col, row })
      Haptics.selection()
    },
    [grid]
  )

  const clearHover = useCallback(() => setHovered(null), [])

  const handleTap = useCallback(
    (col: number, row: number) => {
      const cellData = grid[col]?.[row]
      if (!cellData || cellData.future) return
      onDayPress?.(cellData.date)
    },
    [grid, onDayPress]
  )

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .activateAfterLongPress(SCRUB_LONG_PRESS_MS)
        .onStart((e) => {
          'worklet'
          const col = Math.floor(e.x / stride)
          const row = Math.floor(e.y / stride)
          const valid = col >= 0 && col < weeks && row >= 0 && row <= 6
          const idx = valid ? col * 7 + row : -1
          if (idx === lastIdx.value) return
          lastIdx.value = idx
          if (idx < 0) {
            ringOpacity.value = 0
            runOnJS(clearHover)()
            return
          }
          ringX.value = col * stride
          ringY.value = row * stride
          ringOpacity.value = 1
          runOnJS(applyHover)(col, row)
        })
        .onUpdate((e) => {
          'worklet'
          const col = Math.floor(e.x / stride)
          const row = Math.floor(e.y / stride)
          const valid = col >= 0 && col < weeks && row >= 0 && row <= 6
          const idx = valid ? col * 7 + row : -1
          if (idx === lastIdx.value) return
          lastIdx.value = idx
          if (idx < 0) {
            ringOpacity.value = 0
            runOnJS(clearHover)()
            return
          }
          ringX.value = col * stride
          ringY.value = row * stride
          ringOpacity.value = 1
          runOnJS(applyHover)(col, row)
        })
        .onEnd(() => {
          'worklet'
          // Lift-off behaviour: if the user releases while still hovering a
          // valid cell, treat it as a tap on that cell (navigate). Releasing
          // off-grid leaves `lastIdx` at -1 so this no-ops.
          if (lastIdx.value < 0) return
          const col = Math.floor(lastIdx.value / 7)
          const row = lastIdx.value % 7
          runOnJS(handleTap)(col, row)
        })
        .onFinalize(() => {
          'worklet'
          lastIdx.value = -1
          ringOpacity.value = 0
          runOnJS(clearHover)()
        }),
    [
      applyHover,
      clearHover,
      handleTap,
      ringOpacity,
      ringX,
      ringY,
      lastIdx,
      stride,
      weeks,
    ]
  )

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(TAP_MAX_MS)
        .onEnd((e, success) => {
          'worklet'
          if (!success) return
          const col = Math.floor(e.x / stride)
          const row = Math.floor(e.y / stride)
          if (col < 0 || col >= weeks || row < 0 || row > 6) return
          runOnJS(handleTap)(col, row)
        }),
    [handleTap, stride, weeks]
  )

  const composed = useMemo(
    () => (onDayPress ? Gesture.Exclusive(tap, pan) : pan),
    [onDayPress, tap, pan]
  )

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: ringX.value }, { translateY: ringY.value }],
    opacity: ringOpacity.value,
  }))

  // Month labels: first column of each month renders the month name; others
  // render empty. Labels are absolutely positioned so they can extend past
  // their column without clipping.
  const monthStarts = useMemo(
    () =>
      grid.map((col, i) => {
        const firstOfWeek = col[0].date
        const prevFirst = i > 0 ? grid[i - 1][0].date : null
        const sameMonth =
          prevFirst && moment(firstOfWeek).month() === moment(prevFirst).month()
        return sameMonth ? null : moment(firstOfWeek).format('MMM')
      }),
    [grid]
  )

  return (
    <View style={{ gap: 8 }} onLayout={onLayout}>
      <View style={{ flexDirection: 'row', gap: LABEL_GAP }}>
        <View style={{ width: LABEL_WIDTH }} />
        <View style={{ height: 14, position: 'relative', flex: 1 }}>
          {monthStarts.map((label, i) =>
            label ? (
              <Text
                key={`m-${i}`}
                style={{
                  position: 'absolute',
                  left: i * stride,
                  fontSize: 10,
                  color: theme.colors.textAlt,
                }}
              >
                {label}
              </Text>
            ) : null
          )}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: LABEL_GAP }}>
        <View
          style={{
            width: LABEL_WIDTH,
            height: cell * 7 + GAP * 6,
          }}
        >
          {dayLabels.map((label, i) =>
            label ? (
              <Text
                key={`lbl-${i}`}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: i * stride + cell / 2 - 6,
                  fontSize: 10,
                  lineHeight: 12,
                  color: theme.colors.textAlt,
                }}
              >
                {label}
              </Text>
            ) : null
          )}
        </View>
        <GestureDetector gesture={composed}>
          <View style={{ position: 'relative' }}>
            <CellGrid grid={grid} cell={cell} colors={cellColors} />
            <Animated.View
              pointerEvents='none'
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: cell,
                  height: cell,
                  borderRadius: 2,
                  borderWidth: 1.5,
                  borderColor: theme.colors.text,
                },
                ringStyle,
              ]}
            />
            <ScrubPopover
              hovered={hovered}
              grid={grid}
              cell={cell}
              stride={stride}
              gridPixelWidth={gridPixelWidth}
              theme={theme}
            />
          </View>
        </GestureDetector>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          marginTop: 2,
          marginLeft: LABEL_WIDTH + LABEL_GAP,
        }}
      >
        <Text style={{ fontSize: 10, color: theme.colors.textAlt }}>
          {i18n.t('contributionLess')}
        </Text>
        {([0, 1, 2, 3, 4] as const).map((lv) => (
          <View
            key={`lg-${lv}`}
            style={{
              width: cell,
              height: cell,
              borderRadius: 2,
              backgroundColor: levelToColor(
                lv,
                theme.colors.accent,
                theme.colors.border,
                false
              ),
            }}
          />
        ))}
        <Text style={{ fontSize: 10, color: theme.colors.textAlt }}>
          {i18n.t('contributionMore')}
        </Text>
      </View>
    </View>
  )
}

type ScrubPopoverProps = {
  hovered: { col: number; row: number } | null
  grid: ContributionCell[][]
  cell: number
  stride: number
  gridPixelWidth: number
  theme: ReturnType<typeof useTheme>
}

/**
 * Isolated popover so a cell-transition state update doesn't propagate to the
 * grid. Only this subtree re-renders during a scrub.
 */
const ScrubPopover = ({
  hovered,
  grid,
  cell,
  stride,
  gridPixelWidth,
  theme,
}: ScrubPopoverProps) => {
  if (!hovered) return null
  const hoveredCell = grid[hovered.col]?.[hovered.row]
  if (!hoveredCell) return null

  const hoursLabel =
    hoveredCell.minutes > 0 ? formatMinutesCompact(hoveredCell.minutes) : '—'
  const anchorX = hovered.col * stride + cell / 2 - POPOVER_WIDTH / 2
  const left = Math.max(
    0,
    Math.min(anchorX, Math.max(0, gridPixelWidth - POPOVER_WIDTH))
  )
  // Above the cell for rows 2-6; below for rows 0-1 so the month-label band
  // doesn't clip it.
  const above = hovered.row >= 2
  const top = above
    ? hovered.row * stride - POPOVER_OFFSET - 44
    : hovered.row * stride + cell + POPOVER_OFFSET

  return (
    <View
      pointerEvents='none'
      style={{
        position: 'absolute',
        left,
        top,
        width: POPOVER_WIDTH,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        zIndex: 10,
        elevation: 4,
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.text,
        }}
        numberOfLines={1}
      >
        {moment(hoveredCell.date).format('LL')}
      </Text>
      <Text
        style={{
          fontSize: 11,
          color: theme.colors.textAlt,
        }}
        numberOfLines={1}
      >
        {hoursLabel}
      </Text>
    </View>
  )
}

export default ContributionGraph
