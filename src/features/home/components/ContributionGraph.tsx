import { useMemo, useState } from 'react'
import { LayoutChangeEvent, View } from 'react-native'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import Text from '@/components/MyText'
import { ContributionCell, contributionGrid } from '@/lib/profileStats'
import i18n from '@/lib/locales'

interface Props {
  daily: Map<string, number>
  weeks?: number
}

const GAP = 3
const MIN_CELL = 8
const MAX_CELL = 14
const LABEL_WIDTH = 22
const LABEL_GAP = 4

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

const ContributionGraph = ({ daily, weeks = 26 }: Props) => {
  const theme = useTheme()
  const [width, setWidth] = useState(0)

  const grid = useMemo(() => contributionGrid(daily, weeks), [daily, weeks])

  const cell = useMemo(() => {
    if (width <= 0) return MIN_CELL
    const gridWidth = width - LABEL_WIDTH - LABEL_GAP
    const size = Math.floor((gridWidth - (weeks - 1) * GAP) / weeks)
    return Math.max(MIN_CELL, Math.min(MAX_CELL, size))
  }, [width, weeks])

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

  const levelColor = (cellData: ContributionCell): string => {
    if (cellData.future) return 'transparent'
    const accent = theme.colors.accent
    switch (cellData.level) {
      case 0:
        return theme.colors.border
      case 1:
        return withSaturation(accent, 0.2)
      case 2:
        return withSaturation(accent, 0.5)
      case 3:
        return withSaturation(accent, 0.8)
      case 4:
        return withSaturation(accent, 1)
    }
  }

  // Month labels: first column of each month renders the month name; others
  // render empty. Labels are absolutely positioned so they can extend past
  // their column without clipping.
  const monthStarts = grid.map((col, i) => {
    const firstOfWeek = col[0].date
    const prevFirst = i > 0 ? grid[i - 1][0].date : null
    const sameMonth =
      prevFirst && moment(firstOfWeek).month() === moment(prevFirst).month()
    return sameMonth ? null : moment(firstOfWeek).format('MMM')
  })

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
                  left: i * (cell + GAP),
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
                  top: i * (cell + GAP) + cell / 2 - 6,
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
                    backgroundColor: levelColor(cellData),
                  }}
                />
              ))}
            </View>
          ))}
        </View>
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
        {[0, 1, 2, 3, 4].map((lv) => (
          <View
            key={`lg-${lv}`}
            style={{
              width: cell,
              height: cell,
              borderRadius: 2,
              backgroundColor: levelColor({
                level: lv as ContributionCell['level'],
                date: new Date(),
                minutes: 0,
                future: false,
              }),
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

export default ContributionGraph
