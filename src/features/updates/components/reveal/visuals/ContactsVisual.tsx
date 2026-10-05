import { View } from 'react-native'
import Animated, {
  DerivedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import {
  BookOpen as BookOpenIcon,
  MessageCircle as MessageCircleIcon,
  Navigation as NavigationIcon,
  Plus as PlusIcon,
  UserRound as UserRoundIcon,
} from 'lucide-react-native'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import LucideIcon, { AppIcon } from '@/components/ui/LucideIcon'
import i18n from '@/lib/locales'
import { withAlpha } from '@/lib/color'
import {
  Bar,
  RevealVisualProps,
  Surface,
  TapRipple,
  VisualText,
  backOut,
  seg,
  useRiseStyle,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'

const STRIP_Y = 196
const STRIP_LEFT = 24
const STRIP_RIGHT = 296
const VISIT_DOTS = [0.04, 0.2, 0.33, 0.5, 0.62, 0.74]
const TODAY = 0.84
const NEXT = 0.98
const TIMELINE: { icon: AppIcon; widths: [number, number] }[] = [
  { icon: BookOpenIcon, widths: [118, 172] },
  { icon: MessageCircleIcon, widths: [96, 140] },
]

const stripX = (at: number) => {
  'worklet'
  return STRIP_LEFT + (STRIP_RIGHT - STRIP_LEFT) * at
}

/**
 * The redesigned contact page: who they are, what's up next, and every visit
 * along the way — the journey strip filling in, the timeline below it.
 */
const ContactsVisual = ({
  palette,
  active,
  reduceMotion,
}: RevealVisualProps) => {
  const theme = useTheme()
  const tint = theme.colors.indigo
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 1300,
    loopMs: 5200,
    restAt: 0.8,
  })

  const heroStyle = useRiseStyle(intro, 0, 0.4)
  const cardStyle = useRiseStyle(intro, 0.25, 0.75, 26)
  const stripStyle = useRiseStyle(intro, 0.5, 1)
  const reset = useDerivedValue(() => seg(loop.value, 0.92, 1))
  const logTap = useDerivedValue(() => seg(loop.value, 0.5, 0.6))
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.06 * Math.sin(Math.PI * logTap.value) }],
  }))
  const dashStyle = useAnimatedStyle(() => ({
    width:
      (stripX(NEXT) - stripX(TODAY)) *
      seg(loop.value, 0.4, 0.52) *
      (1 - reset.value),
  }))
  const nextStyle = useAnimatedStyle(() => {
    const p = seg(loop.value, 0.5, 0.58) * (1 - reset.value)
    const ring = (loop.value * 3) % 1
    return {
      opacity: p,
      transform: [
        { scale: 1 + (p > 0.99 ? Math.sin(ring * Math.PI) * 0.25 : 0) },
      ],
    }
  })
  const todayStyle = useAnimatedStyle(() => ({
    opacity: seg(loop.value, 0.34, 0.42) * (1 - reset.value),
  }))

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 8,
            right: 8,
            height: 96,
            borderRadius: 20,
            borderCurve: 'continuous',
            backgroundColor: withAlpha(tint, 0x38),
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 14,
            padding: 14,
          },
          heroStyle,
        ]}
      >
        <View
          style={{
            width: 50,
            height: 50,
            borderRadius: 25,
            backgroundColor: tint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LucideIcon icon={UserRoundIcon} size={26} color='#FFFFFF' />
        </View>
        <View style={{ gap: 9, paddingTop: 6 }}>
          <Bar
            palette={palette}
            width={124}
            height={12}
            color={withAlpha(palette.text, 0xcc)}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <LucideIcon icon={BookOpenIcon} size={12} color={tint} />
            <Bar palette={palette} width={92} height={7} />
          </View>
        </View>
      </Animated.View>

      <Animated.View
        style={[
          { position: 'absolute', top: 70, left: 24, right: 24 },
          cardStyle,
        ]}
      >
        <Surface palette={palette} style={{ padding: 12, gap: 8 }}>
          <VisualText
            style={{
              fontSize: 10,
              letterSpacing: 1,
              fontFamily: theme.fonts.bold,
              color: theme.colors.accent,
              textTransform: 'uppercase',
            }}
          >
            {i18n.t('contactDetails.upNext', {
              countdown: moment().add(2, 'days').fromNow(),
            })}
          </VisualText>
          <Bar
            palette={palette}
            width={136}
            height={13}
            color={withAlpha(palette.text, 0xcc)}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
            <Animated.View style={pressStyle}>
              <View
                style={{
                  height: 30,
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  backgroundColor: theme.colors.accent,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <LucideIcon
                  icon={PlusIcon}
                  size={13}
                  strokeWidth={2.6}
                  color={theme.colors.textInverse}
                />
                <VisualText
                  style={{ fontSize: 12, color: theme.colors.textInverse }}
                >
                  {i18n.t('logVisit')}
                </VisualText>
                <TapRipple
                  tap={logTap}
                  color={theme.colors.textInverse}
                  size={30}
                  style={{ left: 30 }}
                />
              </View>
            </Animated.View>
            <View
              style={{
                height: 30,
                borderRadius: 10,
                paddingHorizontal: 10,
                backgroundColor: withAlpha(theme.colors.accent, 0x26),
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                flexShrink: 1,
              }}
            >
              <LucideIcon
                icon={NavigationIcon}
                size={13}
                color={theme.colors.accent}
              />
              <VisualText
                style={{
                  flexShrink: 1,
                  fontSize: 12,
                  color: theme.colors.accent,
                }}
              >
                {i18n.t('navigate')}
              </VisualText>
            </View>
          </View>
        </Surface>
      </Animated.View>

      <Animated.View
        style={[
          { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
          stripStyle,
        ]}
        pointerEvents='none'
      >
        <View
          style={{
            position: 'absolute',
            top: STRIP_Y,
            left: STRIP_LEFT,
            width: stripX(TODAY) - STRIP_LEFT,
            height: 2,
            borderRadius: 1,
            backgroundColor: palette.skeleton,
          }}
        />
        {VISIT_DOTS.map((at, i) => (
          <VisitDot
            key={at}
            x={stripX(at)}
            index={i}
            loop={loop}
            reset={reset}
            color={i === 2 || i === 4 ? tint : theme.colors.accent}
          />
        ))}
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: STRIP_Y - 9,
              left: stripX(TODAY) - 1.5,
              width: 3,
              height: 20,
              borderRadius: 1.5,
              backgroundColor: palette.text,
            },
            todayStyle,
          ]}
        />
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: STRIP_Y,
              left: stripX(TODAY) + 4,
              height: 2,
              overflow: 'hidden',
              flexDirection: 'row',
              gap: 4,
            },
            dashStyle,
          ]}
        >
          {Array.from({ length: 8 }, (_, i) => (
            <View
              key={i}
              style={{
                width: 4,
                height: 2,
                backgroundColor: theme.colors.accent,
              }}
            />
          ))}
        </Animated.View>
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: STRIP_Y - 6,
              left: stripX(NEXT) - 7,
              width: 14,
              height: 14,
              borderRadius: 7,
              borderWidth: 2.5,
              borderColor: theme.colors.accent,
              backgroundColor: palette.base,
            },
            nextStyle,
          ]}
        />

        {TIMELINE.map((row, i) => (
          <TimelineRow
            key={i}
            index={i}
            icon={row.icon}
            widths={row.widths}
            loop={loop}
            reset={reset}
            palette={palette}
            color={i === 0 ? tint : theme.colors.accent}
          />
        ))}
      </Animated.View>
    </View>
  )
}

const VisitDot = ({
  x,
  index,
  loop,
  reset,
  color,
}: {
  x: number
  index: number
  loop: DerivedValue<number>
  reset: DerivedValue<number>
  color: string
}) => {
  const style = useAnimatedStyle(() => {
    const p = seg(loop.value, 0.04 + index * 0.05, 0.12 + index * 0.05)
    return {
      opacity: Math.min(1, p * 2) * (1 - reset.value),
      transform: [{ scale: backOut(p) }],
    }
  })
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: STRIP_Y - 5,
          left: x - 6,
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: color,
        },
        style,
      ]}
    />
  )
}

const TimelineRow = ({
  index,
  icon,
  widths,
  loop,
  reset,
  palette,
  color,
}: {
  index: number
  icon: AppIcon
  widths: [number, number]
  loop: DerivedValue<number>
  reset: DerivedValue<number>
  palette: RevealVisualProps['palette']
  color: string
}) => {
  const style = useAnimatedStyle(() => {
    const p = seg(loop.value, 0.58 + index * 0.08, 0.72 + index * 0.08)
    return {
      opacity: p * (1 - reset.value),
      transform: [{ translateY: (1 - p) * 10 }],
    }
  })
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 222 + index * 30,
          left: 20,
          right: 20,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        },
        style,
      ]}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: withAlpha(color, 0x33),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LucideIcon icon={icon} size={13} color={color} />
      </View>
      <View style={{ gap: 5 }}>
        <Bar
          palette={palette}
          width={widths[0]}
          height={8}
          color={withAlpha(palette.text, 0x99)}
        />
        <Bar palette={palette} width={widths[1]} height={6} />
      </View>
    </Animated.View>
  )
}

export default ContactsVisual
