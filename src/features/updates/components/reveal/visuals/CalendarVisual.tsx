import { View } from 'react-native'
import Animated, {
  DerivedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import { RefreshCw as RefreshCwIcon } from 'lucide-react-native'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import i18n from '@/lib/locales'
import { withAlpha } from '@/lib/color'
import {
  RevealVisualProps,
  Surface,
  VisualText,
  backOut,
  seg,
  useRiseStyle,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'

const PAD = 14
const COLUMNS = 5
const GRID_TOP = 96
const GRID_H = 160
const ROWS = 4
const COLUMN_W = (320 - PAD * 2) / COLUMNS
const ROW_H = GRID_H / ROWS
// Follow-ups already in the calendar, then the one that syncs in tomorrow.
const EXISTING = [
  { column: 0, row: 1.8, rows: 1 },
  { column: 4, row: 0.3, rows: 0.9 },
]
const NEW = { column: 3, row: 0.7, rows: 1 }

/**
 * Follow-ups in their own calendar: the week around today, and tomorrow's
 * follow-up syncing into place.
 */
const CalendarVisual = ({
  palette,
  active,
  reduceMotion,
}: RevealVisualProps) => {
  const theme = useTheme()
  const color = theme.colors.purple
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 1200,
    loopMs: 5000,
    restAt: 0.6,
  })
  const days = Array.from({ length: COLUMNS }, (_, i) =>
    moment().add(i - 2, 'days')
  )

  const cardStyle = useRiseStyle(intro, 0, 0.4, 22)
  const syncStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${seg(loop.value, 0.08, 0.36) * 360}deg` }],
  }))
  const reset = useDerivedValue(() => seg(loop.value, 0.86, 0.96))
  const drop = useDerivedValue(() => seg(loop.value, 0.2, 0.4))
  const newStyle = useAnimatedStyle(() => {
    const p = drop.value
    return {
      opacity: Math.min(1, p * 2.5) * (1 - reset.value),
      transform: [
        { translateY: -50 * (1 - backOut(p)) },
        { scale: 0.85 + 0.15 * backOut(p) },
      ],
    }
  })
  const glowStyle = useAnimatedStyle(() => ({
    opacity: seg(loop.value, 0.4, 0.46) * (1 - seg(loop.value, 0.5, 0.7)) * 0.8,
  }))

  return (
    <Animated.View style={[{ flex: 1 }, cardStyle]}>
      <Surface palette={palette} style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: PAD,
            paddingTop: 14,
          }}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: color,
            }}
          />
          <VisualText
            style={{
              flex: 1,
              fontSize: 15,
              fontFamily: theme.fonts.bold,
              color: palette.text,
            }}
          >
            {i18n.t('calendarName')}
          </VisualText>
          <Animated.View style={syncStyle}>
            <LucideIcon icon={RefreshCwIcon} size={16} color={color} />
          </Animated.View>
        </View>

        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: PAD,
            marginTop: 14,
          }}
        >
          {days.map((day, i) => (
            <View
              key={i}
              style={{ width: COLUMN_W, alignItems: 'center', gap: 4 }}
            >
              <VisualText style={{ fontSize: 10, color: palette.textAlt }}>
                {day.format('dd')}
              </VisualText>
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: i === 2 ? theme.colors.accent : undefined,
                }}
              >
                <VisualText
                  style={{
                    fontSize: 13,
                    color: i === 2 ? theme.colors.textInverse : palette.text,
                  }}
                >
                  {day.format('D')}
                </VisualText>
              </View>
            </View>
          ))}
        </View>
      </Surface>

      {Array.from({ length: ROWS + 1 }, (_, row) => (
        <View
          key={row}
          style={{
            position: 'absolute',
            top: GRID_TOP + row * ROW_H,
            left: PAD,
            right: PAD,
            height: 1,
            backgroundColor: palette.ringTrack,
          }}
        />
      ))}
      {EXISTING.map((block, i) => (
        <Block
          key={i}
          {...block}
          color={color}
          appear={intro}
          from={0.5 + i * 0.15}
        />
      ))}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: GRID_TOP + NEW.row * ROW_H - 6,
            left: PAD + NEW.column * COLUMN_W - 4,
            width: COLUMN_W + 4,
            height: NEW.rows * ROW_H + 12,
            borderRadius: 12,
            backgroundColor: withAlpha(color, 0x66),
          },
          glowStyle,
        ]}
      />
      <Animated.View
        style={[
          blockFrame(NEW),
          { backgroundColor: color, shadowColor: color, shadowOpacity: 0.5 },
          newStyle,
        ]}
      >
        <VisualText
          numberOfLines={2}
          style={{
            fontSize: 9,
            lineHeight: 11,
            fontFamily: theme.fonts.bold,
            color: '#FFFFFF',
          }}
        >
          {i18n.t('calendarFollowUpTitle')}
        </VisualText>
      </Animated.View>
    </Animated.View>
  )
}

const blockFrame = (block: { column: number; row: number; rows: number }) =>
  ({
    position: 'absolute',
    top: GRID_TOP + block.row * ROW_H,
    left: PAD + block.column * COLUMN_W + 2,
    width: COLUMN_W - 4,
    height: block.rows * ROW_H,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  }) as const

const Block = ({
  column,
  row,
  rows,
  color,
  appear,
  from,
}: {
  column: number
  row: number
  rows: number
  color: string
  appear: DerivedValue<number>
  from: number
}) => {
  const style = useAnimatedStyle(() => {
    const p = seg(appear.value, from, from + 0.35)
    return { opacity: p, transform: [{ scale: 0.9 + 0.1 * backOut(p) }] }
  })
  return (
    <Animated.View
      style={[
        blockFrame({ column, row, rows }),
        {
          backgroundColor: withAlpha(color, 0x33),
          borderLeftWidth: 3,
          borderLeftColor: color,
        },
        style,
      ]}
    />
  )
}

export default CalendarVisual
