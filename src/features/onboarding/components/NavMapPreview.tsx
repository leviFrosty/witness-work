import {
  Building as BuildingIcon,
  MapPin as MapPinIcon,
  Navigation as NavigationIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { useEffect, useState } from 'react'
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native'
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  useReducedMotion,
  withTiming,
  withDelay,
  withSequence,
  withSpring,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnUI } from 'react-native-worklets'
import Svg, { Rect, Path, Circle } from 'react-native-svg'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import type { DefaultNavigationMapProvider } from '@/stores/preferences'
import { tracking } from '@/lib/tracking'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import AppIconImage, { mapAppIconSource } from '@/components/AppIconImage'
import {
  fitAspectRatio,
  type Size,
} from '@/features/onboarding/lib/fitAspectRatio'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

const WITNESSWORK_ICON = require('@/assets/icon.png')

type ProviderKey = 'apple' | 'google' | 'waze'

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
  chromeFgAlt: string
  chromeBorder: string
  startBg: string
  startFg: string
  destShape: 'circle' | 'teardrop' | 'speech'
  nameKey: Extract<TranslationKey, 'appleMaps' | 'googleMaps' | 'waze'>
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
    chromeBg: 'rgba(247,247,250,0.97)',
    chromeFg: '#1C1C1E',
    chromeFgAlt: '#6C6C70',
    chromeBorder: 'rgba(0,0,0,0.08)',
    startBg: '#0A84FF',
    startFg: '#FFFFFF',
    destShape: 'circle',
    nameKey: 'appleMaps',
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
    chromeFgAlt: '#5F6368',
    chromeBorder: 'rgba(0,0,0,0.08)',
    startBg: '#1A73E8',
    startFg: '#FFFFFF',
    destShape: 'teardrop',
    nameKey: 'googleMaps',
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
    chromeBg: '#FFFFFF',
    chromeFg: '#1E2150',
    chromeFgAlt: '#5B5F8A',
    chromeBorder: 'rgba(30,33,80,0.12)',
    startBg: '#33CCFF',
    startFg: '#0E1442',
    destShape: 'speech',
    nameKey: 'waze',
    wordmarkLetterSpacing: 0.4,
  },
}

const ROAD_THICKNESS = 7
const ROADS_H = [76, 140, 196]
const ROADS_V = [60, 160, 252]
const PARK = { x: 172, y: 154, width: 64, height: 30 }
const WATER = { x: 0, y: 152, width: 48, height: 34 }

const ORIGIN = { x: ROADS_V[0], y: ROADS_H[0] }
const DEST = { x: ROADS_V[2], y: ROADS_H[2] }
const ROUTE_MID_Y = ROADS_H[1]

const ROUTE_D = `M ${ORIGIN.x} ${ORIGIN.y} L ${ORIGIN.x} ${ROUTE_MID_Y} L ${DEST.x} ${ROUTE_MID_Y} L ${DEST.x} ${DEST.y}`
const ROUTE_LENGTH =
  ROUTE_MID_Y - ORIGIN.y + (DEST.x - ORIGIN.x) + (DEST.y - ROUTE_MID_Y)

const AnimatedPath = Animated.createAnimatedComponent(Path)

const PIN_HALF = 12
const HALL_LABEL_WIDTH = 76
const LAUNCH_ICON_SIZE = 64
const CARD_RADIUS = inputLayout.sectionRadius

const T = {
  contactIn: 0,
  press: 750,
  iconIn: 950,
  launch: 1450,
  mapIn: 1550,
  route: 1850,
  dest: 2450,
  eta: 2600,
}

interface Props {
  provider: DefaultNavigationMapProvider
}

const NavMapPreview = ({ provider }: Props) => {
  const [frame, setFrame] = useState<Size | null>(null)
  const size = frame && fitAspectRatio(frame, SVG_WIDTH / SVG_HEIGHT)
  const key: ProviderKey = (provider ?? 'apple') as ProviderKey
  const foldColumn = useFoldColumn(inputLayout.contentMaxWidth)

  return (
    <View
      style={[styles.column, foldColumn]}
      accessible
      accessibilityRole='image'
      accessibilityLabel={i18n.t('defaultNavPreview_accessibilityLabel', {
        app: i18n.t(PROVIDER_THEMES[key].nameKey),
      })}
    >
      <View
        style={styles.frame}
        onLayout={(e: LayoutChangeEvent) => setFrame(e.nativeEvent.layout)}
      >
        {size && size.width > 0 && size.height > 0 && (
          <NavMapCard provider={provider} size={size} />
        )}
      </View>
    </View>
  )
}

const cancelAll = (values: SharedValue<number>[]) => {
  'worklet'
  values.forEach((v) => cancelAnimation(v))
}

const NavMapCard = ({ provider, size }: Props & { size: Size }) => {
  const theme = useTheme()
  const reduceMotion = useReducedMotion()
  const key: ProviderKey = (provider ?? 'apple') as ProviderKey
  const mt = PROVIDER_THEMES[key]
  const appName = i18n.t(mt.nameKey)

  const handoff = useSharedValue(0)
  const contactCard = useSharedValue(1)
  const directionsPress = useSharedValue(0)
  const launchIcon = useSharedValue(0)
  const launchZoom = useSharedValue(0)
  const mapChrome = useSharedValue(1)
  const originPin = useSharedValue(1)
  const routeProgress = useSharedValue(1)
  const destPin = useSharedValue(1)
  const eta = useSharedValue(1)

  useEffect(() => {
    const values = [
      handoff,
      contactCard,
      directionsPress,
      launchIcon,
      launchZoom,
      mapChrome,
      originPin,
      routeProgress,
      destPin,
      eta,
    ]
    scheduleOnUI(() => {
      'worklet'
      cancelAll(values)

      if (reduceMotion) {
        handoff.value = 0
        launchIcon.value = 0
        launchZoom.value = 0
        mapChrome.value = 1
        originPin.value = 1
        routeProgress.value = 1
        destPin.value = 1
        eta.value = 1
        return
      }

      handoff.value = 1
      contactCard.value = 0
      directionsPress.value = 0
      launchIcon.value = 0
      launchZoom.value = 0
      mapChrome.value = 0
      originPin.value = 0
      routeProgress.value = 0
      destPin.value = 0
      eta.value = 0

      const out = Easing.out(Easing.cubic)
      contactCard.value = withDelay(
        T.contactIn,
        withTiming(1, { duration: 380, easing: out })
      )
      directionsPress.value = withDelay(
        T.press,
        withSequence(
          withTiming(1, { duration: 110 }),
          withTiming(0, { duration: 200 })
        )
      )
      launchIcon.value = withDelay(
        T.iconIn,
        withSpring(1, { damping: 13, stiffness: 210 })
      )
      launchZoom.value = withDelay(
        T.launch,
        withTiming(1, { duration: 420, easing: Easing.in(Easing.cubic) })
      )
      handoff.value = withDelay(
        T.launch + 120,
        withTiming(0, { duration: 360, easing: out })
      )
      mapChrome.value = withDelay(
        T.mapIn,
        withTiming(1, { duration: 360, easing: out })
      )
      originPin.value = withDelay(
        T.mapIn + 120,
        withSpring(1, { damping: 14, stiffness: 200 })
      )
      routeProgress.value = withDelay(
        T.route,
        withTiming(1, { duration: 720, easing: out })
      )
      destPin.value = withDelay(
        T.dest,
        withSpring(1, { damping: 12, stiffness: 220 })
      )
      eta.value = withDelay(T.eta, withTiming(1, { duration: 320 }))
    })

    return () => cancelAll(values)
  }, [
    key,
    reduceMotion,
    handoff,
    contactCard,
    directionsPress,
    launchIcon,
    launchZoom,
    mapChrome,
    originPin,
    routeProgress,
    destPin,
    eta,
  ])

  const routeAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: ROUTE_LENGTH * (1 - routeProgress.value),
  }))
  const routeOutlineAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: ROUTE_LENGTH * (1 - routeProgress.value),
  }))

  const mapStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (1 - mapChrome.value) * 0.06 }],
  }))
  const handoffStyle = useAnimatedStyle(() => ({
    opacity: handoff.value,
  }))
  const contactStyle = useAnimatedStyle(() => ({
    opacity: contactCard.value * (1 - launchIcon.value * 0.65),
    transform: [
      { translateY: (1 - contactCard.value) * 18 },
      { scale: 1 - launchIcon.value * 0.04 },
    ],
  }))
  const directionsStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - directionsPress.value * 0.06 }],
  }))
  const launchIconStyle = useAnimatedStyle(() => ({
    opacity: Math.min(launchIcon.value, 1) * (1 - launchZoom.value),
    transform: [
      { scale: 0.35 + launchIcon.value * 0.65 + launchZoom.value * 4 },
    ],
  }))
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: mapChrome.value,
  }))
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: mapChrome.value,
    transform: [{ translateY: (1 - mapChrome.value) * 16 }],
  }))
  const originPinStyle = useAnimatedStyle(() => ({
    opacity: originPin.value,
    transform: [
      { scale: 0.4 + originPin.value * 0.6 },
      { translateY: (1 - originPin.value) * -8 },
    ],
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

  const xPct = (x: number) => `${(x / SVG_WIDTH) * 100}%` as `${number}%`
  const yPct = (y: number) => `${(y / SVG_HEIGHT) * 100}%` as `${number}%`

  return (
    <View
      style={[
        styles.container,
        {
          width: size.width,
          height: size.height,
          borderColor: theme.colors.border,
          shadowColor: theme.colors.shadow,
          backgroundColor: mt.bg,
        },
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, mapStyle]}>
        <Svg
          width='100%'
          height='100%'
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          preserveAspectRatio='xMidYMid slice'
        >
          <Rect
            x={0}
            y={0}
            width={SVG_WIDTH}
            height={SVG_HEIGHT}
            fill={mt.bg}
          />

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
              <Circle
                key={cx}
                cx={cx}
                cy={ROUTE_MID_Y}
                r={1.5}
                fill='#FFFFFF'
              />
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
            <View style={[styles.originPin, { backgroundColor: mt.chromeFg }]}>
              <LucideIcon icon={BuildingIcon} size={11} color={mt.chromeBg} />
            </View>
          </Animated.View>
        </View>

        <View
          style={[
            styles.hallLabelAnchor,
            {
              left: xPct(ORIGIN.x),
              top: yPct(ORIGIN.y),
              marginLeft: PIN_HALF + 4,
              marginTop: -10,
            },
          ]}
          pointerEvents='none'
        >
          <Animated.View
            style={[
              styles.hallLabel,
              { backgroundColor: mt.chromeBg, borderColor: mt.chromeBorder },
              originPinStyle,
            ]}
          >
            <Text
              style={{
                fontSize: 10,
                fontFamily: theme.fonts.semiBold,
                color: mt.chromeFg,
              }}
              numberOfLines={1}
            >
              {i18n.t('defaultNavPreview_origin')}
            </Text>
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
      </Animated.View>

      <Animated.View
        style={[
          styles.topBar,
          { backgroundColor: mt.chromeBg, borderBottomColor: mt.chromeBorder },
          chromeStyle,
        ]}
        pointerEvents='none'
      >
        <AppIconImage source={mapAppIconSource(key)} size={20} />
        <Text
          style={[
            styles.barTitle,
            {
              color: mt.chromeFg,
              letterSpacing: tracking(mt.wordmarkLetterSpacing),
              fontFamily: theme.fonts.bold,
            },
          ]}
          numberOfLines={1}
        >
          {appName}
        </Text>
      </Animated.View>

      <Animated.View
        style={[
          styles.bottomSheet,
          {
            backgroundColor: mt.chromeBg,
            borderColor: mt.chromeBorder,
          },
          sheetStyle,
        ]}
        pointerEvents='none'
      >
        <View style={styles.sheetRow}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 13,
                fontFamily: theme.fonts.bold,
                color: mt.chromeFg,
              }}
              numberOfLines={1}
            >
              {i18n.t('defaultNavPreview_contactAddress')}
            </Text>
            <Animated.View style={etaStyle}>
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: theme.fonts.semiBold,
                  color: mt.chromeFgAlt,
                }}
                numberOfLines={1}
              >
                {i18n.t('defaultNavPreview_eta')}
              </Text>
            </Animated.View>
          </View>
          <View style={[styles.startBtn, { backgroundColor: mt.startBg }]}>
            <LucideIcon icon={NavigationIcon} size={12} color={mt.startFg} />
            <Text
              style={{
                fontSize: 12,
                fontFamily: theme.fonts.bold,
                color: mt.startFg,
              }}
            >
              {i18n.t('defaultNavPreview_start')}
            </Text>
          </View>
        </View>
      </Animated.View>

      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.handoff,
          { backgroundColor: theme.colors.background },
          handoffStyle,
        ]}
        pointerEvents='none'
      >
        <View style={styles.wwBar}>
          <AppIconImage source={WITNESSWORK_ICON} size={20} />
          <Text
            style={[
              styles.barTitle,
              { color: theme.colors.text, fontFamily: theme.fonts.bold },
            ]}
            numberOfLines={1}
          >
            {i18n.t('witnessWork')}
          </Text>
        </View>

        <Animated.View
          style={[
            styles.contactCard,
            { backgroundColor: theme.colors.card },
            contactStyle,
          ]}
        >
          <View style={styles.contactRow}>
            <View
              style={[
                styles.contactAvatar,
                { backgroundColor: theme.colors.accentTranslucent },
              ]}
            >
              <Text
                style={{
                  color: theme.colors.accent,
                  fontSize: 15,
                  fontFamily: theme.fonts.bold,
                }}
              >
                {i18n.t('defaultNavPreview_contactName').slice(0, 1)}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{
                  fontSize: 15,
                  fontFamily: theme.fonts.bold,
                  color: theme.colors.text,
                }}
                numberOfLines={1}
              >
                {i18n.t('defaultNavPreview_contactName')}
              </Text>
              <View style={styles.addressRow}>
                <LucideIcon
                  icon={MapPinIcon}
                  size={12}
                  color={theme.colors.textAlt}
                />
                <Text
                  style={{ fontSize: 12, color: theme.colors.textAlt }}
                  numberOfLines={1}
                >
                  {i18n.t('defaultNavPreview_contactAddress')}
                </Text>
              </View>
            </View>
          </View>
          <Animated.View
            style={[
              styles.directionsBtn,
              { backgroundColor: theme.colors.accent },
              directionsStyle,
            ]}
          >
            <AppIconImage source={mapAppIconSource(key)} size={22} />
            <Text
              style={{
                fontSize: 13,
                fontFamily: theme.fonts.bold,
                color: theme.colors.textInverse,
                flexShrink: 1,
              }}
              numberOfLines={1}
            >
              {i18n.t('defaultNavPreview_directionsIn', { app: appName })}
            </Text>
          </Animated.View>
        </Animated.View>
      </Animated.View>

      <View style={styles.launchAnchor} pointerEvents='none'>
        <Animated.View style={[styles.launchIcon, launchIconStyle]}>
          <AppIconImage
            source={mapAppIconSource(key)}
            size={LAUNCH_ICON_SIZE}
          />
        </Animated.View>
      </View>
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
            borderStartWidth: 5,
            borderEndWidth: 5,
            borderTopWidth: 8,
            borderStartColor: 'transparent',
            borderEndColor: 'transparent',
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
            borderStartWidth: 5,
            borderEndWidth: 5,
            borderTopWidth: 7,
            borderStartColor: 'transparent',
            borderEndColor: 'transparent',
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
  column: {
    width: '100%',
    maxWidth: inputLayout.contentMaxWidth,
    alignSelf: 'center',
    flexShrink: 1,
  },

  frame: {
    width: '100%',
    aspectRatio: SVG_WIDTH / SVG_HEIGHT,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  container: {
    borderRadius: CARD_RADIUS,
    borderCurve: 'continuous',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  wwBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  barTitle: {
    fontSize: 14,
    flexShrink: 1,
  },
  hallLabelAnchor: {
    position: 'absolute',
    maxWidth: HALL_LABEL_WIDTH * 1.5,
    alignItems: 'flex-start',
  },
  hallLabel: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    borderRadius: CARD_RADIUS - 10,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingStart: 16,
    paddingEnd: 8,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  handoff: {
    justifyContent: 'space-between',
  },
  contactCard: {
    margin: 10,
    padding: 14,
    gap: 12,
    borderRadius: CARD_RADIUS - 10,
    borderCurve: 'continuous',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  launchAnchor: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  launchIcon: {
    borderRadius: LAUNCH_ICON_SIZE * 0.225,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
})

export default NavMapPreview
