import { View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import {
  Bell as BellIcon,
  CircleCheck as CircleCheckIcon,
  DoorClosed as DoorClosedIcon,
  MessagesSquare as MessagesSquareIcon,
  UserRound as UserRoundIcon,
} from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import i18n from '@/lib/locales'
import { withAlpha } from '@/lib/color'
import {
  Bar,
  RevealVisualProps,
  Surface,
  TapRipple,
  VisualText,
  backOut,
  greetingForNow,
  seg,
  useRiseStyle,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'

const CARD_TOP = 92
const CARD_H = 184

/** A button's dip as a tap lands, early in the tap's 0–1 run. */
const pressDip = (tap: number) => {
  'worklet'
  return Math.sin(Math.PI * Math.min(1, tap * 2.2))
}

/**
 * A smarter Home: the day's greeting, follow-ups marked done right from the
 * card — Talked, Talked, all caught up — and the bell lighting up for what can
 * wait.
 */
const HomeVisual = ({ palette, active, reduceMotion }: RevealVisualProps) => {
  const theme = useTheme()
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 1200,
    loopMs: 5600,
    restAt: 0.78,
  })

  const headerStyle = useRiseStyle(intro, 0, 0.35)
  const greetingStyle = useRiseStyle(intro, 0.1, 0.5)
  const cardStyle = useRiseStyle(intro, 0.25, 0.8, 22)

  // Two taps on Talked, each moving the next follow-up in.
  const firstTap = useDerivedValue(() => seg(loop.value, 0.08, 0.18))
  const secondTap = useDerivedValue(() => seg(loop.value, 0.36, 0.46))
  const reset = useDerivedValue(() => seg(loop.value, 0.9, 1))
  const done = useDerivedValue(() =>
    loop.value >= 0.9
      ? 2 * (1 - reset.value)
      : seg(loop.value, 0.16, 0.28) + seg(loop.value, 0.44, 0.56)
  )

  const pressStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale:
          1 -
          0.06 * Math.max(pressDip(firstTap.value), pressDip(secondTap.value)),
      },
    ],
  }))
  const fillStyle = useAnimatedStyle(() => ({
    width: `${(done.value / 2) * 100}%`,
  }))
  const firstEntryStyle = useAnimatedStyle(() => {
    const out = seg(loop.value, 0.16, 0.28) * (1 - reset.value)
    return {
      opacity: 1 - out,
      transform: [{ translateX: -48 * out }],
    }
  })
  const secondEntryStyle = useAnimatedStyle(() => {
    const t = loop.value
    const inP = seg(t, 0.18, 0.32)
    const out = seg(t, 0.44, 0.56)
    return {
      opacity: inP * (1 - out) * (1 - reset.value),
      transform: [{ translateX: 48 * (1 - inP) - 48 * out }],
    }
  })
  const actionsStyle = useAnimatedStyle(() => {
    const away = seg(loop.value, 0.46, 0.56) * (1 - reset.value)
    return { opacity: 1 - away }
  })
  const caughtUpStyle = useAnimatedStyle(() => {
    const p = seg(loop.value, 0.52, 0.66) * (1 - reset.value)
    return {
      opacity: Math.min(1, p * 2),
      transform: [{ scale: 0.6 + 0.4 * backOut(p) }],
    }
  })
  const bellStyle = useAnimatedStyle(() => {
    const ring = seg(loop.value, 0.64, 0.78)
    return {
      transform: [
        { rotate: `${Math.sin(ring * Math.PI * 5) * 18 * (1 - ring)}deg` },
      ],
    }
  })
  const badgeStyle = useAnimatedStyle(() => {
    const p = seg(loop.value, 0.66, 0.74) * (1 - reset.value)
    return {
      opacity: Math.min(1, p * 2),
      transform: [{ scale: backOut(p) }],
    }
  })
  const progressLabel = (count: number) =>
    i18n.t('followUpCard_progress', { done: count, total: 2 })
  const labelStyles = [
    useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, done.value) })),
    useAnimatedStyle(() => ({
      opacity: Math.min(1, done.value) * (1 - Math.max(0, done.value - 1)),
    })),
    useAnimatedStyle(() => ({ opacity: Math.max(0, done.value - 1) })),
  ]

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 4,
            left: 8,
            right: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          },
          headerStyle,
        ]}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: withAlpha(theme.colors.accent, 0x33),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LucideIcon
            icon={UserRoundIcon}
            size={18}
            color={theme.colors.accent}
          />
        </View>
        <Animated.View style={[{ padding: 6 }, bellStyle]}>
          <LucideIcon icon={BellIcon} size={24} color={palette.text} />
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: 0,
                right: 0,
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                borderWidth: 2,
                borderColor: palette.badgeBorder,
                backgroundColor: theme.colors.error,
                alignItems: 'center',
                justifyContent: 'center',
              },
              badgeStyle,
            ]}
          >
            <VisualText
              style={{
                color: '#FFFFFF',
                fontSize: 9,
                fontFamily: theme.fonts.bold,
              }}
            >
              1
            </VisualText>
          </Animated.View>
        </Animated.View>
      </Animated.View>

      <Animated.View
        style={[{ position: 'absolute', top: 50, left: 8 }, greetingStyle]}
      >
        <VisualText
          style={{
            fontSize: 26,
            fontFamily: theme.fonts.bold,
            color: palette.text,
          }}
        >
          {i18n.t(greetingForNow())}
        </VisualText>
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            top: CARD_TOP,
            left: 8,
            right: 8,
            height: CARD_H,
          },
          cardStyle,
        ]}
      >
        <Surface palette={palette} style={{ flex: 1, padding: 14 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <VisualText
              style={{ flexShrink: 1, fontSize: 14, color: palette.text }}
            >
              {i18n.t('todaysConversations')}
            </VisualText>
            <View style={{ width: 92, alignItems: 'flex-end' }}>
              {[0, 1, 2].map((count) => (
                <Animated.View
                  key={count}
                  style={[
                    count > 0 && { position: 'absolute', right: 0 },
                    labelStyles[count],
                  ]}
                >
                  <VisualText style={{ fontSize: 11, color: palette.textAlt }}>
                    {progressLabel(count)}
                  </VisualText>
                </Animated.View>
              ))}
            </View>
          </View>
          <View
            style={{
              marginTop: 10,
              height: 6,
              borderRadius: 3,
              overflow: 'hidden',
              backgroundColor: palette.skeleton,
            }}
          >
            <Animated.View
              style={[
                {
                  height: '100%',
                  borderRadius: 3,
                  backgroundColor: theme.colors.accent,
                },
                fillStyle,
              ]}
            />
          </View>

          <View style={{ height: 62, marginTop: 14 }}>
            <Entry
              palette={palette}
              color={theme.colors.pink}
              nameWidth={112}
              style={firstEntryStyle}
            />
            <Entry
              palette={palette}
              color={theme.colors.cyan}
              nameWidth={92}
              style={secondEntryStyle}
            />
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  top: 6,
                  left: 0,
                  right: 0,
                  alignItems: 'center',
                  gap: 6,
                },
                caughtUpStyle,
              ]}
            >
              <LucideIcon
                icon={CircleCheckIcon}
                size={36}
                color={theme.colors.accent}
              />
              <VisualText
                style={{
                  fontSize: 14,
                  fontFamily: theme.fonts.bold,
                  color: palette.text,
                }}
              >
                {i18n.t('followUpCard_allCaughtUp')}
              </VisualText>
            </Animated.View>
          </View>

          <Animated.View
            style={[
              { flexDirection: 'row', gap: 8, marginTop: 8 },
              actionsStyle,
            ]}
          >
            <Animated.View style={[{ flex: 1 }, pressStyle]}>
              <View
                style={{
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: theme.colors.accent,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingHorizontal: 8,
                }}
              >
                <LucideIcon
                  icon={MessagesSquareIcon}
                  size={15}
                  color={theme.colors.textInverse}
                />
                <VisualText
                  style={{ fontSize: 13, color: theme.colors.textInverse }}
                >
                  {i18n.t('followUpCard_talked')}
                </VisualText>
                <TapRipple
                  tap={firstTap}
                  color={theme.colors.textInverse}
                  size={36}
                />
                <TapRipple
                  tap={secondTap}
                  color={theme.colors.textInverse}
                  size={36}
                />
              </View>
            </Animated.View>
            <View
              style={{
                flex: 1,
                height: 38,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: palette.surfaceBorder,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingHorizontal: 8,
              }}
            >
              <LucideIcon
                icon={DoorClosedIcon}
                size={15}
                color={palette.text}
              />
              <VisualText
                style={{ flexShrink: 1, fontSize: 13, color: palette.text }}
              >
                {i18n.t('notAtHome')}
              </VisualText>
            </View>
          </Animated.View>
        </Surface>
      </Animated.View>
    </View>
  )
}

const Entry = ({
  palette,
  color,
  nameWidth,
  style,
}: {
  palette: RevealVisualProps['palette']
  color: string
  nameWidth: number
  style: ReturnType<typeof useAnimatedStyle>
}) => (
  <Animated.View
    style={[
      {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      },
      style,
    ]}
  >
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: withAlpha(color, 0x40),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <LucideIcon icon={UserRoundIcon} size={22} color={color} />
    </View>
    <View style={{ gap: 7 }}>
      <Bar
        palette={palette}
        width={nameWidth}
        height={10}
        color={withAlpha(palette.text, 0xb3)}
      />
      <Bar palette={palette} width={nameWidth * 0.7} height={7} />
    </View>
  </Animated.View>
)

export default HomeVisual
