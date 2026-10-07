import { View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import {
  CalendarClock as CalendarClockIcon,
  Check as CheckIcon,
  Flame as FlameIcon,
  Hourglass as HourglassIcon,
  Trash2 as TrashIcon,
} from 'lucide-react-native'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import { withAlpha } from '@/lib/color'
import {
  Bar,
  IconTile,
  RevealVisualProps,
  Surface,
  TapRipple,
  VisualText,
  backOut,
  seg,
  useRiseStyle,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'

const DUE_TOP = 14
const SKIP = { top: 186, height: 70 }
const STREAK = 12
const KEEP_AT = 0.32
const SWIPE_AT = 0.56

/**
 * The grace day: yesterday's Plan with no time yet shows how long is left, and
 * logging it keeps the streak lit. A Plan that can't happen is removed ahead of
 * time, and the streak doesn't mind.
 */
const GraceVisual = ({ palette, active, reduceMotion }: RevealVisualProps) => {
  const theme = useTheme()
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 900,
    loopMs: 6400,
    restAt: 0.5,
  })
  const reset = useDerivedValue(() => seg(loop.value, 0.9, 0.97))
  const tap = useDerivedValue(() =>
    seg(loop.value, KEEP_AT - 0.06, KEEP_AT + 0.04)
  )
  const kept = useDerivedValue(
    () => seg(loop.value, KEEP_AT, KEEP_AT + 0.06) * (1 - reset.value)
  )
  const swipe = useDerivedValue(
    () => seg(loop.value, SWIPE_AT, SWIPE_AT + 0.1) * (1 - reset.value)
  )
  const removed = useDerivedValue(
    () => seg(loop.value, SWIPE_AT + 0.14, SWIPE_AT + 0.22) * (1 - reset.value)
  )

  const dueStyle = useRiseStyle(intro, 0, 0.6, 22)
  const skipIntroStyle = useRiseStyle(intro, 0.3, 0.9, 22)
  const drainStyle = useAnimatedStyle(() => ({
    width: `${(0.62 - 0.3 * seg(loop.value, 0, KEEP_AT)) * (1 - kept.value) * 100}%`,
  }))
  const waitingStyle = useAnimatedStyle(() => ({
    opacity: 1 - kept.value,
    transform: [{ scale: 1 - kept.value * 0.3 }],
  }))
  const keptStyle = useAnimatedStyle(() => ({
    opacity: kept.value,
    transform: [{ scale: 0.6 + 0.4 * backOut(kept.value) }],
  }))
  const flameStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + 0.55 * kept.value,
    transform: [{ scale: 1 + Math.sin(Math.PI * kept.value) * 0.25 }],
  }))
  const rowStyle = useAnimatedStyle(() => ({
    opacity: 1 - removed.value,
    transform: [
      { translateX: -swipe.value * 84 },
      { scaleY: 1 - removed.value * 0.4 },
    ],
  }))
  const trashStyle = useAnimatedStyle(() => ({
    opacity: swipe.value * (1 - removed.value),
  }))

  const yesterday = moment().subtract(1, 'day')
  const friday = moment().day(5)
  const timeLeft = i18n.t('countdownHoursMinutes', { hours: 5, minutes: 12 })
  const planned = useFormattedMinutes(120).formatted

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[
          { position: 'absolute', left: 0, right: 0, top: DUE_TOP },
          dueStyle,
        ]}
      >
        <Surface palette={palette} style={{ padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconTile
              icon={CalendarClockIcon}
              color={theme.colors.accent}
              size={40}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <VisualText
                style={{
                  fontSize: 15,
                  fontFamily: theme.fonts.bold,
                  color: palette.text,
                }}
              >
                {yesterday.format('dddd')}
              </VisualText>
              <VisualText style={{ fontSize: 12, color: palette.textAlt }}>
                {planned}
              </VisualText>
            </View>
            <View style={{ width: 92, alignItems: 'flex-end' }}>
              <Animated.View
                style={[
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: theme.colors.warnTranslucent,
                  },
                  waitingStyle,
                ]}
              >
                <LucideIcon
                  icon={HourglassIcon}
                  size={12}
                  color={theme.colors.warnText}
                />
                <VisualText
                  style={{ fontSize: 12, color: theme.colors.warnText }}
                >
                  {timeLeft}
                </VisualText>
              </Animated.View>
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    right: 0,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: withAlpha(theme.colors.accent, 0x2e),
                  },
                  keptStyle,
                ]}
              >
                <LucideIcon
                  icon={CheckIcon}
                  size={12}
                  strokeWidth={3}
                  color={theme.colors.accent}
                />
                <VisualText
                  style={{ fontSize: 12, color: theme.colors.accent }}
                >
                  {i18n.t('scheduleIntro_kept')}
                </VisualText>
              </Animated.View>
            </View>
          </View>
          <View
            style={{
              height: 6,
              marginTop: 14,
              borderRadius: 3,
              backgroundColor: palette.skeleton,
              overflow: 'hidden',
            }}
          >
            <Animated.View
              style={[
                {
                  height: '100%',
                  borderRadius: 3,
                  backgroundColor: theme.colors.warn,
                },
                drainStyle,
              ]}
            />
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 14,
            }}
          >
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 10,
                backgroundColor: theme.colors.accent,
              }}
            >
              <VisualText
                style={{ fontSize: 12, color: theme.colors.textInverse }}
              >
                {i18n.t('addTime')}
              </VisualText>
              <TapRipple
                tap={tap}
                color={theme.colors.accent}
                size={40}
                style={{ left: 24, top: -6 }}
              />
            </View>
            <Animated.View
              style={[
                { flexDirection: 'row', alignItems: 'center', gap: 4 },
                flameStyle,
              ]}
            >
              <LucideIcon
                icon={FlameIcon}
                size={18}
                color={theme.colors.orange}
                fill={theme.colors.orange}
              />
              <VisualText
                style={{
                  fontSize: 15,
                  fontFamily: theme.fonts.bold,
                  color: theme.colors.orange,
                }}
              >
                {String(STREAK)}
              </VisualText>
            </Animated.View>
          </View>
        </Surface>
      </Animated.View>

      <Animated.View
        style={[
          { position: 'absolute', left: 0, right: 0, top: SKIP.top - 24 },
          skipIntroStyle,
        ]}
      >
        <VisualText
          style={{ fontSize: 12, color: palette.textAlt, marginLeft: 6 }}
        >
          {i18n.t('scheduleIntro_cantMakeIt')}
        </VisualText>
        <View
          style={{
            marginTop: 8,
            height: SKIP.height,
            borderRadius: 18,
            borderCurve: 'continuous',
            overflow: 'hidden',
          }}
        >
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: 0,
                width: 96,
                alignItems: 'flex-end',
                justifyContent: 'center',
                paddingRight: 28,
                backgroundColor: theme.colors.error,
              },
              trashStyle,
            ]}
          >
            <LucideIcon icon={TrashIcon} size={20} color='#FFFFFF' />
          </Animated.View>
          <Animated.View style={[{ flex: 1 }, rowStyle]}>
            <Surface
              palette={palette}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 14,
              }}
            >
              <IconTile
                icon={CalendarClockIcon}
                color={theme.colors.accent}
                size={34}
              />
              <View style={{ flex: 1, gap: 6 }}>
                <VisualText
                  style={{
                    fontSize: 14,
                    fontFamily: theme.fonts.bold,
                    color: palette.text,
                  }}
                >
                  {`${friday.format('dddd')} · ${formatStartTime(9 * 60 + 30)}`}
                </VisualText>
                <Bar palette={palette} width='55%' />
              </View>
            </Surface>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  )
}

export default GraceVisual
