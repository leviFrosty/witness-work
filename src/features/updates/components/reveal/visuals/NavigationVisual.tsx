import { View } from 'react-native'
import Animated, {
  DerivedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import {
  BookUser as BookUserIcon,
  CalendarDays as CalendarDaysIcon,
  ChartLine as ChartLineIcon,
  CircleHelp as CircleHelpIcon,
  House as HouseIcon,
  Map as MapIcon,
  Plus as PlusIcon,
  Settings as SettingsIcon,
  UserRound as UserRoundIcon,
} from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import i18n from '@/lib/locales'
import { withAlpha } from '@/lib/color'
import {
  RevealVisualProps,
  Surface,
  TapRipple,
  VisualText,
  backOut,
  seg,
  useRiseStyle,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'

const BAR_X = 10
const BAR_Y = 206
const BAR_H = 60
const OLD_BAR_W = 300
const NEW_BAR_W = 238
const ADD_W = 62
const TABS = [
  { icon: HouseIcon, label: () => i18n.t('Home') },
  { icon: CalendarDaysIcon, label: () => i18n.t('Schedule') },
  { icon: BookUserIcon, label: () => i18n.t('Contacts') },
  { icon: ChartLineIcon, label: () => i18n.t('Progress') },
]
const oldCenter = (i: number) => {
  'worklet'
  return BAR_X + (OLD_BAR_W / 5) * (i + 0.5)
}
const newCenter = (i: number) => {
  'worklet'
  return BAR_X + (NEW_BAR_W / 4) * (i + 0.5)
}
const MENU_ROWS = [
  { icon: UserRoundIcon, label: () => i18n.t('accountMenu_profile') },
  { icon: SettingsIcon, label: () => i18n.t('settings') },
  { icon: CircleHelpIcon, label: () => i18n.t('helpCenter') },
]
const MENU_ROW_H = 38

/**
 * Four labeled tabs: the old bar's Map tab folds into Contacts, the rest gain
 * labels beside the new Add button, and Settings opens from the avatar.
 */
const NavigationVisual = ({
  palette,
  active,
  reduceMotion,
}: RevealVisualProps) => {
  const theme = useTheme()
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 2200,
    loopMs: 5600,
    restAt: 0.78,
  })

  const headerStyle = useRiseStyle(intro, 0.02, 0.22)
  const barRise = useRiseStyle(intro, 0, 0.2, 24)
  // 0 = the old five-tab bar, 1 = four labeled tabs and Add.
  const morph = useDerivedValue(() => seg(intro.value, 0.5, 0.85))

  const barStyle = useAnimatedStyle(() => ({
    width: OLD_BAR_W + (NEW_BAR_W - OLD_BAR_W) * morph.value,
  }))
  const mapStyle = useAnimatedStyle(() => {
    const p = seg(intro.value, 0.28, 0.6)
    const x = oldCenter(4) + (newCenter(2) - oldCenter(4)) * p
    return {
      opacity: 1 - seg(intro.value, 0.5, 0.62),
      transform: [
        { translateX: x - 12 },
        { translateY: -Math.sin(Math.PI * p) * 34 },
        { scale: 1 - p * 0.45 },
      ],
    }
  })
  const addStyle = useAnimatedStyle(() => {
    const p = seg(intro.value, 0.72, 1)
    return {
      opacity: Math.min(1, p * 2),
      transform: [{ scale: 0.4 + 0.6 * backOut(p) }],
    }
  })
  // The highlight hops across the tabs, then rests on Home.
  const highlightStyle = useAnimatedStyle(() => {
    const t = loop.value
    let x = newCenter(0)
    x += (newCenter(1) - newCenter(0)) * seg(t, 0.04, 0.1)
    x += (newCenter(2) - newCenter(1)) * seg(t, 0.14, 0.2)
    x += (newCenter(3) - newCenter(2)) * seg(t, 0.24, 0.3)
    x += (newCenter(0) - newCenter(3)) * seg(t, 0.34, 0.42)
    return {
      opacity: morph.value,
      transform: [{ translateX: x - 27 }],
    }
  })
  const avatarTap = useDerivedValue(() => seg(loop.value, 0.45, 0.55))
  const settingsTap = useDerivedValue(() => seg(loop.value, 0.64, 0.74))
  const menuStyle = useAnimatedStyle(() => {
    const open = seg(loop.value, 0.5, 0.6) * (1 - seg(loop.value, 0.9, 0.98))
    return {
      opacity: open,
      transform: [
        { translateY: (1 - open) * -10 },
        { scale: 0.92 + 0.08 * open },
      ],
    }
  })
  const settingsRowStyle = useAnimatedStyle(() => ({
    opacity: seg(loop.value, 0.66, 0.72) * (1 - seg(loop.value, 0.9, 0.96)),
  }))

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 6,
            left: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          },
          headerStyle,
        ]}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: withAlpha(theme.colors.accent, 0x33),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LucideIcon
            icon={UserRoundIcon}
            size={20}
            color={theme.colors.accent}
          />
          <TapRipple tap={avatarTap} color={theme.colors.accent} size={44} />
        </View>
        <VisualText
          style={{
            fontSize: 24,
            fontFamily: theme.fonts.bold,
            color: palette.text,
          }}
        >
          {i18n.t('Home')}
        </VisualText>
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 56,
            left: 8,
            width: 184,
            transformOrigin: ['14%', '0%', 0],
          },
          menuStyle,
        ]}
      >
        <Surface palette={palette} style={{ padding: 6 }}>
          {MENU_ROWS.map((row, i) => (
            <View
              key={i}
              style={{
                height: MENU_ROW_H,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 10,
                borderRadius: 10,
              }}
            >
              {i === 1 && (
                <Animated.View
                  style={[
                    {
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      borderRadius: 10,
                      backgroundColor: withAlpha(theme.colors.accent, 0x2e),
                    },
                    settingsRowStyle,
                  ]}
                />
              )}
              <LucideIcon icon={row.icon} size={16} color={palette.text} />
              <VisualText style={{ color: palette.text, fontSize: 13 }}>
                {row.label()}
              </VisualText>
              {i === 1 && (
                <TapRipple
                  tap={settingsTap}
                  color={theme.colors.accent}
                  size={32}
                  style={{ right: 18 }}
                />
              )}
            </View>
          ))}
        </Surface>
      </Animated.View>

      <Animated.View
        style={[
          { position: 'absolute', top: BAR_Y, left: 0, right: 0 },
          barRise,
        ]}
      >
        <Animated.View style={[{ marginLeft: BAR_X, height: BAR_H }, barStyle]}>
          <Surface
            palette={palette}
            style={{ flex: 1, borderRadius: BAR_H / 2 }}
          />
        </Animated.View>
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 5,
              width: 54,
              height: BAR_H - 10,
              borderRadius: 18,
              backgroundColor: withAlpha(theme.colors.accent, 0x2e),
            },
            highlightStyle,
          ]}
        />
        {TABS.map((tab, i) => (
          <TabSlot
            key={i}
            index={i}
            icon={tab.icon}
            label={tab.label()}
            morph={morph}
            textColor={palette.text}
            labelColor={palette.textAlt}
          />
        ))}
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: (BAR_H - 24) / 2 - 2,
              left: 0,
              width: 24,
              height: 24,
              alignItems: 'center',
              justifyContent: 'center',
            },
            mapStyle,
          ]}
        >
          <LucideIcon icon={MapIcon} size={22} color={palette.text} />
        </Animated.View>
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: BAR_X + NEW_BAR_W + 10,
              width: ADD_W,
              height: BAR_H,
              borderRadius: BAR_H / 2,
              backgroundColor: theme.colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: theme.colors.accent,
              shadowOpacity: 0.4,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
            },
            addStyle,
          ]}
        >
          <LucideIcon
            icon={PlusIcon}
            size={24}
            strokeWidth={2.6}
            color={theme.colors.textInverse}
          />
        </Animated.View>
      </Animated.View>
    </View>
  )
}

const TabSlot = ({
  index,
  icon,
  label,
  morph,
  textColor,
  labelColor,
}: {
  index: number
  icon: typeof HouseIcon
  label: string
  morph: DerivedValue<number>
  textColor: string
  labelColor: string
}) => {
  const slotStyle = useAnimatedStyle(() => {
    const x =
      oldCenter(index) + (newCenter(index) - oldCenter(index)) * morph.value
    return { transform: [{ translateX: x - 30 }] }
  })
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: 9 * (1 - morph.value) }],
  }))
  const labelStyle = useAnimatedStyle(() => ({ opacity: morph.value }))
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 8,
          left: 0,
          width: 60,
          alignItems: 'center',
          gap: 3,
        },
        slotStyle,
      ]}
    >
      <Animated.View style={iconStyle}>
        <LucideIcon icon={icon} size={22} color={textColor} />
      </Animated.View>
      <Animated.View style={labelStyle}>
        <VisualText
          style={{ fontSize: 10, color: labelColor, textAlign: 'center' }}
        >
          {label}
        </VisualText>
      </Animated.View>
    </Animated.View>
  )
}

export default NavigationVisual
