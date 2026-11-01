import { memo, useCallback, useMemo, useState } from 'react'
import { LayoutChangeEvent, View } from 'react-native'
import {
  Gesture,
  GestureDetector,
  PointerType,
} from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'
import moment from 'moment'
import { formatDate } from '@/lib/dates'
import { forwardSign, isRtlLayout } from '@/lib/direction'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import Haptics from '@/lib/haptics'
import { FIT_ONE_LINE } from '@/hooks/useAccessibilityTextSize'
import { notePointerHover, supportsPointerHover } from '@/lib/pointerHover'
import { formatMinutesCompact } from '@/lib/minutes'
import {
  ContributionCell,
  contributionColumnAt,
  contributionGrid,
  contributionMonthLabels,
  contributionSummary,
  fittingMonthLabels,
} from '@/features/profile/lib/profileStats'
import i18n, { type TranslationKey } from '@/lib/locales'

interface Props {
  daily: Map<string, number>
  weeks?: number
}

const GAP = 3
const MIN_CELL = 8
const MAX_CELL = 14
const LABEL_WIDTH = 22
const LABEL_GAP = 4

const MONTH_LABEL_GAP = 4
const POPOVER_WIDTH = 150
const POPOVER_OFFSET = 8

const SCRUB_LONG_PRESS_MS = 200

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

type ColorByLevel = Record<0 | 1 | 2 | 3 | 4, string>

type CellGridProps = {
  grid: ContributionCell[][]
  cell: number
  colorByLevel: ColorByLevel
}

const CellGrid = memo(({ grid, cell, colorByLevel }: CellGridProps) => {
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
                backgroundColor: cellData.future
                  ? 'transparent'
                  : colorByLevel[cellData.level],
              }}
            />
          ))}
        </View>
      ))}
    </View>
  )
})
CellGrid.displayName = 'CellGrid'

const accessibilityLabelFor = (grid: ContributionCell[][], weeks: number) => {
  const { daysWithService, longestRun } = contributionSummary(grid)
  if (!daysWithService) {
    return i18n.t('contribution_a11yEmpty' as TranslationKey, { count: weeks })
  }
  return i18n.t('contribution_a11ySummary' as TranslationKey, {
    count: weeks,
    days: i18n.t('contribution_a11yDays' as TranslationKey, {
      count: daysWithService,
    }),
    run: i18n.t('contribution_a11yRun' as TranslationKey, {
      count: longestRun,
    }),
  })
}

const ContributionGraph = ({ daily, weeks = 26 }: Props) => {
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

  const lastIdx = useSharedValue(-1)

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

  const colorByLevel = useMemo<ColorByLevel>(
    () => ({
      0: theme.colors.border,
      1: withSaturation(theme.colors.accent, LEVEL_SATURATION[1]),
      2: withSaturation(theme.colors.accent, LEVEL_SATURATION[2]),
      3: withSaturation(theme.colors.accent, LEVEL_SATURATION[3]),
      4: withSaturation(theme.colors.accent, LEVEL_SATURATION[4]),
    }),
    [theme.colors.accent, theme.colors.border]
  )

  const applyHover = useCallback(
    (col: number, row: number, haptic: boolean) => {
      const cellData = grid[col]?.[row]
      if (!cellData || cellData.future) {
        setHovered(null)
        return
      }
      setHovered({ col, row })
      if (haptic) Haptics.selection()
    },
    [grid]
  )

  const clearHover = useCallback(() => setHovered(null), [])

  const rtl = isRtlLayout()
  const sign = forwardSign()

  const gesture = useMemo(() => {
    const scrubTo = (x: number, y: number, haptic: boolean) => {
      'worklet'
      const col = contributionColumnAt(x, stride, gridPixelWidth, rtl)
      const row = Math.floor(y / stride)
      const valid = col >= 0 && col < weeks && row >= 0 && row <= 6
      const idx = valid ? col * 7 + row : -1
      if (idx === lastIdx.value) return
      lastIdx.value = idx
      if (idx < 0) {
        ringOpacity.value = 0
        runOnJS(clearHover)()
        return
      }

      ringX.value = sign * col * stride
      ringY.value = row * stride
      ringOpacity.value = 1
      runOnJS(applyHover)(col, row, haptic)
    }
    const endScrub = () => {
      'worklet'
      lastIdx.value = -1
      ringOpacity.value = 0
      runOnJS(clearHover)()
    }

    const pan = Gesture.Pan()
      .minDistance(0)
      .activateAfterLongPress(SCRUB_LONG_PRESS_MS)
      .onStart((e) => {
        'worklet'
        scrubTo(e.x, e.y, true)
      })
      .onUpdate((e) => {
        'worklet'
        scrubTo(e.x, e.y, true)
      })
      .onFinalize(endScrub)
    if (!supportsPointerHover) return pan

    const hover = Gesture.Hover()
      .onBegin((e) => {
        'worklet'
        runOnJS(notePointerHover)(
          e.pointerType === PointerType.STYLUS ? 'stylus' : 'pointer'
        )
        scrubTo(e.x, e.y, false)
      })
      .onUpdate((e) => {
        'worklet'
        scrubTo(e.x, e.y, false)
      })
      .onFinalize(endScrub)
    return Gesture.Simultaneous(pan, hover)
  }, [
    applyHover,
    clearHover,
    ringOpacity,
    ringX,
    ringY,
    lastIdx,
    stride,
    weeks,
    rtl,
    sign,
    gridPixelWidth,
  ])

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: ringX.value }, { translateY: ringY.value }],
    opacity: ringOpacity.value,
  }))

  const monthLabels = useMemo(() => contributionMonthLabels(grid), [grid])
  const [labelSizes, setLabelSizes] = useState<
    Record<number, { width: number; height: number }>
  >({})
  const labelWidths = Object.fromEntries(
    Object.entries(labelSizes).map(([column, size]) => [column, size.width])
  )

  const labelRowHeight = Math.max(
    14,
    ...Object.values(labelSizes).map((size) => size.height)
  )
  const measured = monthLabels.every(
    (label) => labelSizes[label.column] !== undefined
  )
  const shownColumns = new Set(
    measured
      ? fittingMonthLabels(
          monthLabels,
          labelWidths,
          stride,
          MONTH_LABEL_GAP,
          width > 0 ? width - LABEL_WIDTH - LABEL_GAP : undefined
        ).map((label) => label.column)
      : []
  )
  const onLabelLayout = (column: number) => (e: LayoutChangeEvent) => {
    const { width: labelWidth, height } = e.nativeEvent.layout
    setLabelSizes((current) =>
      current[column]?.width === labelWidth &&
      current[column]?.height === height
        ? current
        : { ...current, [column]: { width: labelWidth, height } }
    )
  }

  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityRole='image'
      accessibilityLabel={accessibilityLabelFor(grid, weeks)}
    >
      {}
      <View
        style={{ gap: 8 }}
        accessibilityElementsHidden
        importantForAccessibility='no-hide-descendants'
      >
        <View style={{ flexDirection: 'row', gap: LABEL_GAP }}>
          <View style={{ width: LABEL_WIDTH }} />
          <View
            style={{ height: labelRowHeight, position: 'relative', flex: 1 }}
          >
            {monthLabels.map(({ column, label }) => (
              <Text
                key={`m-${column}`}
                onLayout={onLabelLayout(column)}
                numberOfLines={1}
                style={{
                  position: 'absolute',
                  left: column * stride,
                  fontSize: 10,
                  color: theme.colors.textAlt,

                  opacity: shownColumns.has(column) ? 1 : 0,
                }}
              >
                {label}
              </Text>
            ))}
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
                <View
                  key={`lbl-${i}`}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: i * stride + cell / 2 - stride,
                    width: LABEL_WIDTH,
                    height: stride * 2,
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    {...FIT_ONE_LINE}
                    style={{ fontSize: 10, color: theme.colors.textAlt }}
                  >
                    {label}
                  </Text>
                </View>
              ) : null
            )}
          </View>
          <GestureDetector gesture={gesture}>
            <View style={{ position: 'relative' }}>
              <CellGrid grid={grid} cell={cell} colorByLevel={colorByLevel} />
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
                backgroundColor: colorByLevel[lv],
              }}
            />
          ))}
          <Text style={{ fontSize: 10, color: theme.colors.textAlt }}>
            {i18n.t('contributionMore')}
          </Text>
        </View>
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
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {formatDate(hoveredCell.date)}
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
