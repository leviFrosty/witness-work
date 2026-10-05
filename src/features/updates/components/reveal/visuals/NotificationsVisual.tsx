import { View } from 'react-native'
import Animated, {
  DerivedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import {
  ArrowLeftRight as ArrowLeftRightIcon,
  Bell as BellIcon,
  CalendarX as CalendarXIcon,
  FileOutput as FileOutputIcon,
  Send as SendIcon,
  UserRound as UserRoundIcon,
} from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import LucideIcon, { AppIcon } from '@/components/ui/LucideIcon'
import i18n from '@/lib/locales'
import { withAlpha } from '@/lib/color'
import {
  Bar,
  IconTile,
  RevealVisualProps,
  Surface,
  TapRipple,
  VisualText,
  backOut,
  greetingForNow,
  seg,
  segInOut,
  useRiseStyle,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'

const BELL = { x: 292, y: 22 }
const NOTICE = { width: 236, height: 50 }
/** Notices that used to land on Home, piled up as they would after a while away. */
const NOTICES: {
  icon: AppIcon
  color: 'accent' | 'orange' | 'cyan' | 'pink'
  x: number
  y: number
  tilt: number
  bar: number
}[] = [
  { icon: SendIcon, color: 'accent', x: 12, y: 92, tilt: -3, bar: 128 },
  {
    icon: ArrowLeftRightIcon,
    color: 'orange',
    x: 48,
    y: 130,
    tilt: 2.5,
    bar: 104,
  },
  { icon: FileOutputIcon, color: 'cyan', x: 20, y: 168, tilt: -2, bar: 140 },
  { icon: CalendarXIcon, color: 'pink', x: 56, y: 206, tilt: 3, bar: 96 },
]
/** When each notice finishes flying into the bell. */
const flyWindow = (i: number) => {
  'worklet'
  return { from: 0.3 + i * 0.06, to: 0.44 + i * 0.06 }
}
const NOTICE_COUNT = NOTICES.length
const PANEL = { right: 8, top: 48, width: 238 }

/**
 * Nothing piles up: the reminders that used to stack on Home after a while away
 * fly into the bell instead, Home settles, and the bell opens on a tidy list.
 */
const NotificationsVisual = ({
  palette,
  active,
  reduceMotion,
}: RevealVisualProps) => {
  const theme = useTheme()
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 900,
    loopMs: 6400,
    restAt: 0.82,
  })

  const headerStyle = useRiseStyle(intro, 0, 0.45)
  const greetingStyle = useRiseStyle(intro, 0.15, 0.7)
  // How many notices have reached the bell, and a pop as each arrives.
  const arrived = useDerivedValue(() => {
    let count = 0
    for (let i = 0; i < NOTICE_COUNT; i++) {
      if (loop.value >= flyWindow(i).to) count++
    }
    return count
  })
  const bellTap = useDerivedValue(() => seg(loop.value, 0.68, 0.78))
  const open = useDerivedValue(
    () => seg(loop.value, 0.72, 0.8) * (1 - seg(loop.value, 0.9, 0.96))
  )

  const bellStyle = useAnimatedStyle(() => {
    const ring = seg(loop.value, 0.38, 0.66)
    return {
      transform: [
        { rotate: `${Math.sin(ring * Math.PI * 8) * 16 * (1 - ring)}deg` },
      ],
    }
  })
  const badgeStyle = useAnimatedStyle(() => {
    let pop = 0
    for (let i = 0; i < NOTICE_COUNT; i++) {
      const at = flyWindow(i).to
      pop = Math.max(pop, Math.sin(Math.PI * seg(loop.value, at, at + 0.05)))
    }
    // Opening the tray reads them.
    const seen = seg(loop.value, 0.76, 0.82)
    return {
      opacity: Math.min(1, arrived.value) * (1 - seen),
      transform: [{ scale: 1 + 0.35 * pop }],
    }
  })
  const calmStyle = useAnimatedStyle(() => {
    const p = seg(loop.value, 0.58, 0.7) * (1 - seg(loop.value, 0.94, 1))
    return {
      opacity: p,
      transform: [{ translateY: (1 - backOut(p)) * 18 }],
    }
  })
  const panelStyle = useAnimatedStyle(() => ({
    opacity: open.value,
    transform: [
      { translateY: (1 - open.value) * -10 },
      { scale: 0.9 + 0.1 * open.value },
    ],
  }))

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
            {NOTICES.map((_, i) => (
              <BadgeCount key={i} count={i + 1} arrived={arrived} />
            ))}
          </Animated.View>
        </Animated.View>
      </Animated.View>
      <TapRipple
        tap={bellTap}
        color={theme.colors.accent}
        size={40}
        style={{ left: BELL.x - 20, top: BELL.y - 20 }}
      />

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
          { position: 'absolute', top: 96, left: 8, right: 8, height: 150 },
          calmStyle,
        ]}
      >
        <Surface palette={palette} style={{ flex: 1, padding: 16, gap: 14 }}>
          <Bar
            palette={palette}
            width={120}
            height={10}
            color={withAlpha(palette.text, 0xb3)}
          />
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                borderWidth: 7,
                borderColor: theme.colors.accent,
              }}
            />
            <View style={{ gap: 9 }}>
              <Bar palette={palette} width={140} height={9} />
              <Bar palette={palette} width={100} height={7} />
              <Bar palette={palette} width={120} height={7} />
            </View>
          </View>
        </Surface>
      </Animated.View>

      {NOTICES.map((notice, i) => (
        <Notice
          key={i}
          index={i}
          icon={notice.icon}
          color={theme.colors[notice.color]}
          fill={theme.colors.card}
          palette={palette}
          loop={loop}
        />
      ))}

      <Animated.View
        style={[
          {
            position: 'absolute',
            top: PANEL.top,
            right: PANEL.right,
            width: PANEL.width,
            transformOrigin: ['92%', '0%', 0],
          },
          panelStyle,
        ]}
      >
        <Surface
          palette={palette}
          style={{
            padding: 10,
            gap: 4,
            backgroundColor: theme.colors.card,
          }}
        >
          <VisualText
            style={{
              fontSize: 13,
              fontFamily: theme.fonts.bold,
              color: palette.text,
              paddingHorizontal: 4,
              paddingBottom: 4,
            }}
          >
            {i18n.t('notifications_title')}
          </VisualText>
          {NOTICES.map((notice, i) => (
            <TrayRow
              key={i}
              index={i}
              icon={notice.icon}
              color={theme.colors[notice.color]}
              bar={notice.bar * 0.8}
              palette={palette}
              open={open}
            />
          ))}
        </Surface>
      </Animated.View>
    </View>
  )
}

/** One of the badge's numbers, shown while it's the count. */
const BadgeCount = ({
  count,
  arrived,
}: {
  count: number
  arrived: DerivedValue<number>
}) => {
  const theme = useTheme()
  const style = useAnimatedStyle(() => ({
    opacity: arrived.value === count ? 1 : 0,
  }))
  return (
    <Animated.View
      style={[
        count > 1 && { position: 'absolute' },
        { paddingHorizontal: 4 },
        style,
      ]}
    >
      <VisualText
        style={{ color: '#FFFFFF', fontSize: 9, fontFamily: theme.fonts.bold }}
      >
        {String(count)}
      </VisualText>
    </Animated.View>
  )
}

/**
 * A notice landing on Home, then gathered up into the bell — shrinking along
 * the way so the bell takes it in.
 */
const Notice = ({
  index,
  icon,
  color,
  fill,
  palette,
  loop,
}: {
  index: number
  icon: AppIcon
  color: string
  /** Solid, so the pile reads as cards on top of each other. */
  fill: string
  palette: RevealVisualProps['palette']
  loop: DerivedValue<number>
}) => {
  const notice = NOTICES[index]
  const { tilt } = notice
  const dx = BELL.x - (notice.x + NOTICE.width / 2)
  const dy = BELL.y - (notice.y + NOTICE.height / 2)
  const style = useAnimatedStyle(() => {
    const land = seg(loop.value, 0.02 + index * 0.05, 0.12 + index * 0.05)
    const { from, to } = flyWindow(index)
    const fly = segInOut(loop.value, from, to)
    return {
      opacity: Math.min(1, land * 2) * (1 - seg(fly, 0.7, 1)),
      transform: [
        { translateX: dx * fly },
        { translateY: -26 * (1 - backOut(land)) + dy * fly },
        { rotate: `${tilt * (1 - fly)}deg` },
        { scale: 1 - 0.9 * fly },
      ],
    }
  })
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: notice.x,
          top: notice.y,
          width: NOTICE.width,
        },
        style,
      ]}
    >
      <Surface
        palette={palette}
        style={{
          height: NOTICE.height,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 10,
          borderRadius: 14,
          backgroundColor: fill,
        }}
      >
        <IconTile icon={icon} color={color} size={30} />
        <View style={{ gap: 6 }}>
          <Bar
            palette={palette}
            width={notice.bar}
            height={8}
            color={withAlpha(palette.text, 0x99)}
          />
          <Bar palette={palette} width={notice.bar * 0.6} height={6} />
        </View>
      </Surface>
    </Animated.View>
  )
}

/** A row in the open tray, settling in a beat after the one above. */
const TrayRow = ({
  index,
  icon,
  color,
  bar,
  palette,
  open,
}: {
  index: number
  icon: AppIcon
  color: string
  bar: number
  palette: RevealVisualProps['palette']
  open: DerivedValue<number>
}) => {
  const style = useAnimatedStyle(() => {
    const p = seg(open.value, 0.15 + index * 0.15, 0.55 + index * 0.15)
    return {
      opacity: p,
      transform: [{ translateY: (1 - p) * 8 }],
    }
  })
  return (
    <Animated.View
      style={[
        {
          height: 40,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 4,
        },
        style,
      ]}
    >
      <IconTile icon={icon} color={color} size={26} />
      <View style={{ gap: 5 }}>
        <Bar
          palette={palette}
          width={bar}
          height={8}
          color={withAlpha(palette.text, 0x99)}
        />
        <Bar palette={palette} width={bar * 0.55} height={6} />
      </View>
    </Animated.View>
  )
}

export default NotificationsVisual
