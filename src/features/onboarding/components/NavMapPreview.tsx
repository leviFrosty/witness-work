import {
  Building as BuildingIcon,
  Navigation as NavigationIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withDelay,
  withSequence,
  withSpring,
  cancelAnimation,
} from 'react-native-reanimated'
import { scheduleOnUI } from 'react-native-worklets'
import Svg, { Rect, Path, Circle } from 'react-native-svg'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import type { DefaultNavigationMapProvider } from '@/stores/preferences'

type ProviderKey = 'apple' | 'google' | 'waze'

// Stylized "poster" map drawn entirely in SVG. We deliberately avoid
// `react-native-maps` here: a real MapView paints over absolute-positioned
// siblings on iOS (the chrome / bottom sheet vanish behind it), and Apple's
// licensing forces a "Maps" watermark + real POI labels (Times Square,
// Rockefeller Center, etc.) to bleed through, drowning the brand chrome we're
// trying to render.

const SVG_WIDTH = 320
const SVG_HEIGHT = 280

interface MapTheme {
  bg: string
  road: string
  primaryRoad?: string
  primaryRoadWidth?: number
  park: string
  water?: string
  routeColor: string
  routeWidth: number
  routeOutline: string | null
  routeOutlineWidth: number
  chromeBg: string
  chromeFg: string
  startBg: string
  startFg: string
  destShape: 'circle' | 'teardrop' | 'speech'
  wordmarkKey: Extract<TranslationKey, 'appleMaps' | 'googleMaps' | 'waze'>
  wordmarkLetterSpacing: number
}

const PROVIDER_THEMES: Record<ProviderKey, MapTheme> = {
  apple: {
    bg: '#DDE0E5',
    road: '#F2F4F7',
    park: '#B8D9A0',
    water: '#A9CCE3',
    routeColor: '#0A84FF',
    routeWidth: 5,
    routeOutline: null,
    routeOutlineWidth: 0,
    chromeBg: 'rgba(247,247,250,0.95)',
    chromeFg: '#1C1C1E',
    startBg: '#0A84FF',
    startFg: '#FFFFFF',
    destShape: 'circle',
    wordmarkKey: 'appleMaps',
    wordmarkLetterSpacing: -0.4,
  },
  google: {
    bg: '#F5F1E4',
    road: '#FFFFFF',
    primaryRoad: '#FFE067',
    primaryRoadWidth: 11,
    park: '#B7DFA1',
    water: '#A0CFEA',
    routeColor: '#4285F4',
    routeWidth: 6,
    routeOutline: '#FFFFFF',
    routeOutlineWidth: 9,
    chromeBg: '#FFFFFF',
    chromeFg: '#202124',
    startBg: '#1A73E8',
    startFg: '#FFFFFF',
    destShape: 'teardrop',
    wordmarkKey: 'googleMaps',
    wordmarkLetterSpacing: 0,
  },
  waze: {
    bg: '#1E2150',
    road: '#3A4080',
    primaryRoad: '#FFD93D',
    primaryRoadWidth: 9,
    park: '#3D6B5E',
    routeColor: '#33CCFF',
    routeWidth: 7,
    routeOutline: '#0E1442',
    routeOutlineWidth: 11,
    chromeBg: '#5D5FEF',
    chromeFg: '#FFFFFF',
    startBg: '#FFD93D',
    startFg: '#1E2150',
    destShape: 'speech',
    wordmarkKey: 'waze',
    wordmarkLetterSpacing: 0.4,
  },
}

const ROAD_THICKNESS = 7
const ROADS_H = [44, 124, 210]
const ROADS_V = [60, 160, 252]
const PARK = { x: 175, y: 8, width: 60, height: 28 }
const WATER = { x: 0, y: 252, width: 130, height: 28 }

const ORIGIN = { x: ROADS_V[0], y: ROADS_H[0] }
const DEST = { x: ROADS_V[2], y: ROADS_H[2] }
const ROUTE_MID_Y = ROADS_H[1]

const ROUTE_D = `M ${ORIGIN.x} ${ORIGIN.y} L ${ORIGIN.x} ${ROUTE_MID_Y} L ${DEST.x} ${ROUTE_MID_Y} L ${DEST.x} ${DEST.y}`
const ROUTE_LENGTH =
  ROUTE_MID_Y - ORIGIN.y + (DEST.x - ORIGIN.x) + (DEST.y - ROUTE_MID_Y)

const AnimatedPath = Animated.createAnimatedComponent(Path)

const PIN_HALF = 12
const HALL_LABEL_WIDTH = 76

interface Props {
  provider: DefaultNavigationMapProvider
}

const NavMapPreview = ({ provider }: Props) => {
  const theme = useTheme()
  const key: ProviderKey = (provider ?? 'apple') as ProviderKey
  const mt = PROVIDER_THEMES[key]

  // Initialize entrance values to their final state (1). The effect resets
  // them to 0 and re-animates on mount/provider-change. Defaulting to 1 means
  // a missed effect, hot reload, or animation cancellation never strands an
  // element at opacity 0 — the worst-case is the entrance animation just
  // doesn't play, but everything stays visible.
  const originPin = useSharedValue(1)
  const hallLabel = useSharedValue(1)
  const contactCard = useSharedValue(1)
  const startPress = useSharedValue(0)
  const destPin = useSharedValue(1)
  const routeProgress = useSharedValue(1)
  const eta = useSharedValue(1)
  const chromeOpacity = useSharedValue(1)

  useEffect(() => {
    // Run the cancel + reset + animation start as a single worklet on the UI
    // thread. Doing this from JS as `value = 0; value = withTiming(1)` races
    // across the JS↔UI boundary in Reanimated 4: the withTiming descriptor
    // can be read against a stale "current value" before the reset lands,
    // leaving every animated element stranded at 0 (invisible). Inside a
    // worklet, the three steps execute synchronously on the UI runner so
    // withTiming/withSpring always start from the freshly-reset 0.
    scheduleOnUI(() => {
      'worklet'
      cancelAnimation(originPin)
      cancelAnimation(hallLabel)
      cancelAnimation(contactCard)
      cancelAnimation(startPress)
      cancelAnimation(destPin)
      cancelAnimation(routeProgress)
      cancelAnimation(eta)
      cancelAnimation(chromeOpacity)

      chromeOpacity.value = 0
      originPin.value = 0
      hallLabel.value = 0
      contactCard.value = 0
      startPress.value = 0
      destPin.value = 0
      routeProgress.value = 0
      eta.value = 0

      chromeOpacity.value = withTiming(1, {
        duration: 240,
        easing: Easing.out(Easing.cubic),
      })
      originPin.value = withDelay(
        120,
        withSpring(1, { damping: 14, stiffness: 200 })
      )
      hallLabel.value = withDelay(220, withTiming(1, { duration: 320 }))
      contactCard.value = withDelay(
        380,
        withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) })
      )
      startPress.value = withDelay(
        900,
        withSequence(
          withTiming(1, { duration: 110 }),
          withTiming(0, { duration: 220 })
        )
      )
      destPin.value = withDelay(
        1100,
        withSpring(1, { damping: 12, stiffness: 220 })
      )
      routeProgress.value = withDelay(
        1180,
        withTiming(1, { duration: 720, easing: Easing.out(Easing.cubic) })
      )
      eta.value = withDelay(1700, withTiming(1, { duration: 320 }))
    })

    return () => {
      cancelAnimation(originPin)
      cancelAnimation(hallLabel)
      cancelAnimation(contactCard)
      cancelAnimation(startPress)
      cancelAnimation(destPin)
      cancelAnimation(routeProgress)
      cancelAnimation(eta)
      cancelAnimation(chromeOpacity)
    }
  }, [
    key,
    originPin,
    hallLabel,
    contactCard,
    startPress,
    destPin,
    routeProgress,
    eta,
    chromeOpacity,
  ])

  const routeAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: ROUTE_LENGTH * (1 - routeProgress.value),
  }))
  const routeOutlineAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: ROUTE_LENGTH * (1 - routeProgress.value),
  }))

  // Animated styles deliberately set ONLY opacity + transform-for-animation.
  // Static layout offsets (centering on the anchor) live on the outer wrapper
  // View so the animated `transform` array doesn't replace them.
  const originPinStyle = useAnimatedStyle(() => ({
    opacity: originPin.value,
    transform: [
      { scale: 0.4 + originPin.value * 0.6 },
      { translateY: (1 - originPin.value) * -8 },
    ],
  }))
  const hallLabelStyle = useAnimatedStyle(() => ({
    opacity: hallLabel.value,
    transform: [{ translateY: (1 - hallLabel.value) * -6 }],
  }))
  const contactStyle = useAnimatedStyle(() => ({
    opacity: contactCard.value,
    transform: [{ translateY: (1 - contactCard.value) * 16 }],
  }))
  const startPressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - startPress.value * 0.08 }],
  }))
  const destPinStyle = useAnimatedStyle(() => ({
    opacity: destPin.value,
    transform: [
      { scale: 0.4 + destPin.value * 0.6 },
      { translateY: (1 - destPin.value) * -10 },
    ],
  }))
  const etaStyle = useAnimatedStyle(() => ({
    opacity: eta.value,
    transform: [{ scale: 0.85 + eta.value * 0.15 }],
  }))
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: chromeOpacity.value,
  }))

  const xPct = (x: number) => `${(x / SVG_WIDTH) * 100}%` as `${number}%`
  const yPct = (y: number) => `${(y / SVG_HEIGHT) * 100}%` as `${number}%`

  return (
    <View
      style={[
        styles.container,
        {
          borderColor: theme.colors.border,
          shadowColor: theme.colors.shadow,
        },
      ]}
    >
      <Svg
        width='100%'
        height='100%'
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        preserveAspectRatio='xMidYMid slice'
      >
        <Rect x={0} y={0} width={SVG_WIDTH} height={SVG_HEIGHT} fill={mt.bg} />

        <Rect
          x={PARK.x}
          y={PARK.y}
          width={PARK.width}
          height={PARK.height}
          rx={4}
          fill={mt.park}
        />
        {mt.water && (
          <Rect
            x={WATER.x}
            y={WATER.y}
            width={WATER.width}
            height={WATER.height}
            fill={mt.water}
          />
        )}

        {ROADS_V.map((x) => (
          <Rect
            key={`v-${x}`}
            x={x - ROAD_THICKNESS / 2}
            y={0}
            width={ROAD_THICKNESS}
            height={SVG_HEIGHT}
            fill={mt.road}
          />
        ))}
        {ROADS_H.map((y, i) => {
          const isPrimary = i === 1 && mt.primaryRoad
          const thickness = isPrimary ? mt.primaryRoadWidth! : ROAD_THICKNESS
          return (
            <Rect
              key={`h-${y}`}
              x={0}
              y={y - thickness / 2}
              width={SVG_WIDTH}
              height={thickness}
              fill={isPrimary ? mt.primaryRoad! : mt.road}
            />
          )
        })}

        {mt.routeOutline && (
          <AnimatedPath
            d={ROUTE_D}
            stroke={mt.routeOutline}
            strokeWidth={mt.routeOutlineWidth}
            fill='none'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeDasharray={`${ROUTE_LENGTH} ${ROUTE_LENGTH}`}
            animatedProps={routeOutlineAnimatedProps}
          />
        )}
        <AnimatedPath
          d={ROUTE_D}
          stroke={mt.routeColor}
          strokeWidth={mt.routeWidth}
          fill='none'
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeDasharray={`${ROUTE_LENGTH} ${ROUTE_LENGTH}`}
          animatedProps={routeAnimatedProps}
        />

        {key === 'waze' &&
          [90, 145, 200].map((cx) => (
            <Circle key={cx} cx={cx} cy={ROUTE_MID_Y} r={1.5} fill='#FFFFFF' />
          ))}
      </Svg>

      <View
        style={[
          styles.pinAnchor,
          {
            left: xPct(ORIGIN.x),
            top: yPct(ORIGIN.y),
            marginLeft: -PIN_HALF,
            marginTop: -PIN_HALF,
          },
        ]}
        pointerEvents='none'
      >
        <Animated.View style={originPinStyle}>
          <View
            style={[styles.originPin, { backgroundColor: theme.colors.text }]}
          >
            <LucideIcon
              icon={BuildingIcon}
              size={11}
              color={theme.colors.card}
            />
          </View>
        </Animated.View>
      </View>

      <View
        style={[
          styles.pinAnchor,
          {
            left: xPct(DEST.x),
            top: yPct(DEST.y),
            marginLeft: -PIN_HALF,
            marginTop: -PIN_HALF,
          },
        ]}
        pointerEvents='none'
      >
        <Animated.View style={destPinStyle}>
          <DestinationPin shape={mt.destShape} color={mt.routeColor} />
        </Animated.View>
      </View>

      <Animated.View
        style={[styles.topBar, { backgroundColor: mt.chromeBg }, chromeStyle]}
        pointerEvents='none'
      >
        <Text
          style={[
            styles.wordmark,
            {
              color: mt.chromeFg,
              letterSpacing: mt.wordmarkLetterSpacing,
              fontFamily: theme.fonts.bold,
            },
          ]}
        >
          {i18n.t(mt.wordmarkKey)}
        </Text>
      </Animated.View>

      <View
        style={[
          styles.hallLabelAnchor,
          {
            left: xPct(ORIGIN.x),
            top: yPct(ORIGIN.y - 22),
            marginLeft: -HALL_LABEL_WIDTH / 2,
          },
        ]}
        pointerEvents='none'
      >
        <Animated.View
          style={[
            styles.hallLabel,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              shadowColor: theme.colors.shadow,
            },
            hallLabelStyle,
          ]}
        >
          <Text
            style={{
              fontSize: 10,
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.text,
            }}
            numberOfLines={1}
          >
            {i18n.t('defaultNavPreview_origin')}
          </Text>
        </Animated.View>
      </View>

      <Animated.View
        style={[
          styles.bottomSheet,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            shadowColor: theme.colors.shadow,
          },
          contactStyle,
        ]}
        pointerEvents='none'
      >
        <View style={styles.contactRow}>
          <View
            style={[styles.contactAvatar, { backgroundColor: mt.routeColor }]}
          >
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 12,
                fontFamily: theme.fonts.bold,
              }}
            >
              {i18n.t('defaultNavPreview_contactName').slice(0, 1)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 12,
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.text,
              }}
              numberOfLines={1}
            >
              {i18n.t('defaultNavPreview_contactName')}
              {' · '}
              {i18n.t('defaultNavPreview_contactAddress')}
            </Text>
            <Text style={{ fontSize: 10, color: theme.colors.textAlt }}>
              {i18n.t('defaultNavPreview_contactRole')}
            </Text>
          </View>
          <Animated.View style={etaStyle}>
            <Text
              style={{
                fontSize: 13,
                fontFamily: theme.fonts.bold,
                color: mt.routeColor,
              }}
            >
              {i18n.t('defaultNavPreview_eta')}
            </Text>
          </Animated.View>
        </View>
        <Animated.View
          style={[
            styles.startBtn,
            { backgroundColor: mt.startBg },
            startPressStyle,
          ]}
        >
          <LucideIcon icon={NavigationIcon} size={11} color={mt.startFg} />
          <Text
            style={{
              fontSize: 12,
              fontFamily: theme.fonts.bold,
              color: mt.startFg,
              letterSpacing: 0.4,
            }}
          >
            {i18n.t('defaultNavPreview_start')}
          </Text>
        </Animated.View>
      </Animated.View>
    </View>
  )
}

const DestinationPin = ({
  shape,
  color,
}: {
  shape: 'circle' | 'teardrop' | 'speech'
  color: string
}) => {
  if (shape === 'teardrop') {
    return (
      <View style={{ alignItems: 'center', transform: [{ translateY: -10 }] }}>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: color,
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 2,
            borderColor: '#FFFFFF',
          }}
        >
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 3.5,
              backgroundColor: '#FFFFFF',
            }}
          />
        </View>
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: 5,
            borderRightWidth: 5,
            borderTopWidth: 8,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: color,
            marginTop: -2,
          }}
        />
      </View>
    )
  }
  if (shape === 'speech') {
    return (
      <View style={{ alignItems: 'center', transform: [{ translateY: -10 }] }}>
        <View
          style={{
            paddingHorizontal: 9,
            paddingVertical: 5,
            backgroundColor: color,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: '#FFFFFF',
          }}
        >
          <LucideIcon icon={NavigationIcon} size={10} color={'#1E2150'} />
        </View>
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: 5,
            borderRightWidth: 5,
            borderTopWidth: 7,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: color,
            marginTop: -2,
          }}
        />
      </View>
    )
  }
  return (
    <View
      style={{
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: color,
        borderWidth: 3,
        borderColor: '#FFFFFF',
      }}
    />
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: SVG_WIDTH / SVG_HEIGHT,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  pinAnchor: {
    position: 'absolute',
  },
  originPin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  wordmark: {
    fontSize: 14,
  },
  hallLabelAnchor: {
    position: 'absolute',
    width: HALL_LABEL_WIDTH,
    alignItems: 'center',
  },
  hallLabel: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 7,
  },
  contactAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 8,
  },
})

export default NavMapPreview
