import { PropsWithChildren, useEffect } from 'react'
import { View } from 'react-native'
import {
  FileText as FileTextIcon,
  Folder as FolderIcon,
  Link as LinkIcon,
  Lock as LockIcon,
  StickyNote as StickyNoteIcon,
  User as UserIcon,
  WifiOff as WifiOffIcon,
} from 'lucide-react-native'
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import { withAlpha } from '@/lib/color'

/**
 * Small looping sketches for the onboarding privacy screen. Each one acts out a
 * promise (works offline, stays on the device, shares by link, exports anytime)
 * so the screen can show it instead of explaining it. Purely presentational.
 */
export interface PrivacyIllustrationProps {
  color: string
  /** Hold the loop still at a representative frame. */
  reduceMotion: boolean
}

const PHONE_WIDTH = 38
const PHONE_HEIGHT = 64

/**
 * Drives a 0→1 clock that repeats forever, or sits at `still` when motion is
 * reduced.
 */
const useLoop = (reduceMotion: boolean, duration: number, still = 1) => {
  const t = useSharedValue(reduceMotion ? still : 0)

  useEffect(() => {
    if (reduceMotion) {
      t.value = still
      return
    }
    t.value = 0
    t.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.cubic) }),
      -1,
      false
    )
    return () => cancelAnimation(t)
  }, [reduceMotion, duration, still, t])

  return t
}

const Phone = ({
  color,
  width = PHONE_WIDTH,
  height = PHONE_HEIGHT,
  children,
}: PropsWithChildren<{ color: string; width?: number; height?: number }>) => {
  const theme = useTheme()
  return (
    <View
      style={{
        width,
        height,
        borderRadius: 9,
        borderCurve: 'continuous',
        borderWidth: 2,
        borderColor: withAlpha(color, 0xcc),
        backgroundColor: theme.colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  )
}

const Badge = ({ icon, color }: { icon: AppIcon; color: string }) => {
  const theme = useTheme()
  return (
    <View
      style={{
        position: 'absolute',
        top: -8,
        right: -10,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: color,
        borderWidth: 2,
        borderColor: theme.colors.backgroundLighter,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <LucideIcon icon={icon} size={11} color={theme.colors.textInverse} />
    </View>
  )
}

/** The phone keeps working with no signal: a progress bar fills on repeat. */
export const OfflineIllustration = ({
  color,
  reduceMotion,
}: PrivacyIllustrationProps) => {
  const theme = useTheme()
  const t = useLoop(reduceMotion, 2400, 0.7)
  const fill = useAnimatedStyle(() => ({
    width: `${interpolate(t.value, [0, 0.8, 1], [8, 100, 100])}%`,
    opacity: interpolate(t.value, [0, 0.85, 1], [1, 1, 0]),
  }))

  return (
    <View>
      <Phone color={color}>
        {[0, 1, 2].map((row) => (
          <View
            key={row}
            style={{
              width: row === 2 ? 14 : 22,
              height: 3,
              borderRadius: 2,
              backgroundColor: withAlpha(theme.colors.textAlt, 0x55),
            }}
          />
        ))}
        <View
          style={{
            width: 24,
            height: 5,
            borderRadius: 3,
            backgroundColor: withAlpha(color, 0x33),
            overflow: 'hidden',
          }}
        >
          <Animated.View
            style={[
              { height: '100%', borderRadius: 3, backgroundColor: color },
              fill,
            ]}
          />
        </View>
      </Phone>
      <Badge icon={WifiOffIcon} color={color} />
    </View>
  )
}

const RECORD_ICONS = [UserIcon, FileTextIcon, StickyNoteIcon]

const Record = ({
  icon,
  index,
  color,
  reduceMotion,
}: {
  icon: AppIcon
  index: number
  color: string
  reduceMotion: boolean
}) => {
  const t = useSharedValue(0)

  useEffect(() => {
    if (reduceMotion) {
      t.value = 0
      return
    }
    t.value = withDelay(
      index * 350,
      withRepeat(
        withTiming(1, { duration: 1050, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      )
    )
    return () => cancelAnimation(t)
  }, [reduceMotion, index, t])

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + t.value * 0.12 }],
    opacity: 0.7 + t.value * 0.3,
  }))

  return (
    <Animated.View
      style={[
        {
          width: 24,
          height: 14,
          borderRadius: 4,
          backgroundColor: withAlpha(color, 0x2e),
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <LucideIcon icon={icon} size={9} color={color} />
    </Animated.View>
  )
}

/** Contacts, reports, and notes live inside the locked phone. */
export const OnDeviceIllustration = ({
  color,
  reduceMotion,
}: PrivacyIllustrationProps) => (
  <View>
    <Phone color={color}>
      {RECORD_ICONS.map((icon, index) => (
        <Record
          key={index}
          icon={icon}
          index={index}
          color={color}
          reduceMotion={reduceMotion}
        />
      ))}
    </Phone>
    <Badge icon={LockIcon} color={color} />
  </View>
)

const SHARE_GAP = 46

/** A contact travels phone to phone inside the link itself. */
export const ShareLinkIllustration = ({
  color,
  reduceMotion,
}: PrivacyIllustrationProps) => {
  const theme = useTheme()
  const t = useLoop(reduceMotion, 2600, 0.5)
  const travel = SHARE_GAP + 24
  const chip = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          t.value,
          [0, 0.15, 0.85, 1],
          [0, 0, travel, travel]
        ),
      },
    ],
    opacity: interpolate(t.value, [0, 0.1, 0.9, 1], [0, 1, 1, 0]),
  }))
  const arrived = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.8, 0.9, 1], [0.25, 0.25, 1, 0.25]),
  }))
  const phone = { color, width: 30, height: 50 }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Phone {...phone}>
        <LucideIcon icon={UserIcon} size={12} color={color} />
      </Phone>
      <View
        style={{
          width: SHARE_GAP,
          borderTopWidth: 2,
          borderStyle: 'dashed',
          borderColor: withAlpha(theme.colors.textAlt, 0x66),
        }}
      />
      <Phone {...phone}>
        <Animated.View style={arrived}>
          <LucideIcon icon={UserIcon} size={12} color={color} />
        </Animated.View>
      </Phone>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 3,
            width: 24,
            height: 18,
            borderRadius: 9,
            backgroundColor: color,
            alignItems: 'center',
            justifyContent: 'center',
          },
          chip,
        ]}
      >
        <LucideIcon
          icon={LinkIcon}
          size={11}
          color={theme.colors.textInverse}
        />
      </Animated.View>
    </View>
  )
}

const EXPORT_GAP = 30

/** A full backup slides out of the phone into a folder the user keeps. */
export const ExportIllustration = ({
  color,
  reduceMotion,
}: PrivacyIllustrationProps) => {
  const theme = useTheme()
  const t = useLoop(reduceMotion, 2400, 0.6)
  const travel = EXPORT_GAP + 30
  const file = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          t.value,
          [0, 0.2, 0.75, 1],
          [0, 0, travel, travel]
        ),
      },
      {
        translateY: interpolate(
          t.value,
          [0, 0.2, 0.45, 0.75, 1],
          [0, 0, -8, 0, 0]
        ),
      },
      { scale: interpolate(t.value, [0, 0.75, 0.9, 1], [1, 1, 0.6, 0.6]) },
    ],
    opacity: interpolate(t.value, [0, 0.1, 0.8, 0.95, 1], [0, 1, 1, 0, 0]),
  }))
  const folder = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(t.value, [0, 0.75, 0.85, 1], [1, 1, 1.15, 1]) },
    ],
  }))

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Phone color={color} width={30} height={50}>
        <View
          style={{
            width: 16,
            height: 3,
            borderRadius: 2,
            backgroundColor: withAlpha(theme.colors.textAlt, 0x55),
          }}
        />
      </Phone>
      <View style={{ width: EXPORT_GAP }} />
      <Animated.View style={folder}>
        <LucideIcon
          icon={FolderIcon}
          size={34}
          color={color}
          fill={withAlpha(color, 0x2e)}
        />
      </Animated.View>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 6,
            width: 18,
            height: 22,
            borderRadius: 4,
            backgroundColor: color,
            alignItems: 'center',
            justifyContent: 'center',
          },
          file,
        ]}
      >
        <LucideIcon
          icon={FileTextIcon}
          size={11}
          color={theme.colors.textInverse}
        />
      </Animated.View>
    </View>
  )
}
