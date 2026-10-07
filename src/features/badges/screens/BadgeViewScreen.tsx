import { X as XIcon } from 'lucide-react-native'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import {
  type RouteProp,
  useNavigation,
  useRoute,
} from '@react-navigation/native'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg'
import { scheduleOnRN } from 'react-native-worklets'
import { badgePalette } from '@/components/badges/art/palette'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PointerHover from '@/components/ui/PointerHover'
import useTheme from '@/contexts/theme'
import BadgeViewCoin from '@/features/badges/components/badge-view/BadgeViewCoin'
import BadgeViewDetails from '@/features/badges/components/badge-view/BadgeViewDetails'
import BadgeViewStatus from '@/features/badges/components/badge-view/BadgeViewStatus'
import BadgeWordmark from '@/features/badges/components/badge-view/BadgeWordmark'
import useBadgeSurface from '@/features/badges/hooks/useBadgeSurface'
import { nextLevel } from '@/features/badges/lib/badgeText'
import useUser from '@/hooks/useUser'
import { badgeKey, isCollectionId, parseBadgeKey } from '@/lib/badges/catalog'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import { useBadgeSession } from '@/stores/badgeSession'
import { usePreferences } from '@/stores/preferences'
import { BADGE_LEVELS, type BadgeArtId, type BadgeLevel } from '@/types/badges'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'

const MIN_COIN = 150
const MAX_COIN = 260
const OPEN_MS = 560
const CLOSE_MS = 420
const FADE_MS = 220
const DISMISS_DISTANCE = 140
const DISMISS_VELOCITY = 900
/** Whole turns settle with a little wobble: the coin's "tilt". */
const TURN_SPRING = { damping: 13, stiffness: 80, mass: 1 }
const OWNER_AVATAR = 24

/** Who the badge belongs to, when it's a buddy's. */
export type BadgeViewBuddy = { name: string; avatar: ReactNode }

type Point = { x: number; y: number }
type Geometry = { target: Point; origin: (Point & { size: number }) | null }

/**
 * One badge, full screen and ready for a screenshot: the coin flips out of the
 * medallion that was tapped and settles large with a sweep of light, over what
 * it stands for, whose it is, and the app's name. The User's own badges also
 * show how their collection is growing; a level not reached yet says "Not yet"
 * and how to grow it. Reduce Motion crossfades instead. Closes with the X, a
 * swipe down, or Android's back, flying back into its medallion when that's
 * still on screen.
 *
 * The app tier passes the buddy (for a buddy's badge) and `footer`, where
 * Buddies reactions go.
 */
export default function BadgeViewScreen({
  buddy,
  footer,
}: {
  /** A buddy's badge: their name and avatar. Null when they're gone. */
  buddy?: BadgeViewBuddy | null
  footer?: ReactNode
}) {
  const navigation = useNavigation<RootStackNavigation>()
  const { params } = useRoute<RouteProp<RootStackParamList, 'BadgeView'>>()
  const parsed = parseBadgeKey(params.badgeKey)

  useEffect(() => {
    if (!parsed) navigation.goBack()
  }, [navigation, parsed])

  if (!parsed) return null
  return (
    <BadgeViewContent
      art={parsed.art}
      level={parsed.level}
      buddy={buddy}
      footer={footer}
    />
  )
}

function BadgeViewContent({
  art,
  level,
  buddy,
  footer,
}: {
  art: BadgeArtId
  level: BadgeLevel | null
  buddy?: BadgeViewBuddy | null
  footer?: ReactNode
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const navigation = useNavigation<RootStackNavigation>()
  const { params } = useRoute<RouteProp<RootStackParamList, 'BadgeView'>>()
  const reduceMotion = useReducedMotion()
  const user = useUser()

  const mine = params.owner === 'me'
  const key = badgeKey(art, level)
  const record = usePreferences((s) =>
    mine ? (s.earnedBadges[key] ?? null) : null
  )
  const collection = isCollectionId(art) ? art : null
  const live = useBadgeSession((s) =>
    mine && collection ? (s.evaluation?.collections[collection] ?? null) : null
  )
  const storedLevel = usePreferences((s) =>
    mine && collection
      ? BADGE_LEVELS.reduce<BadgeLevel | 0>(
          (best, step) =>
            s.earnedBadges[badgeKey(collection, step)] ? step : best,
          0
        )
      : 0
  )
  const locked = mine && !record
  const state = locked ? 'locked' : 'earned'
  const currentLevel = Math.max(storedLevel, live?.level ?? 0) as BadgeLevel | 0

  const owner: BadgeViewBuddy | null = locked
    ? null
    : mine
      ? user.hasName
        ? {
            name: user.name,
            avatar: (
              <Avatar
                avatar={user.avatar}
                name={user.name}
                size={OWNER_AVATAR}
              />
            ),
          }
        : null
      : (buddy ?? null)

  const { scheme, surface } = useBadgeSurface()
  const glow = locked ? null : badgePalette(level, scheme, 'earned').rim?.[1]
  const coinSize = Math.round(
    Math.min(MAX_COIN, Math.max(MIN_COIN, Math.min(width * 0.6, height * 0.3)))
  )

  const root = useRef<View>(null)
  const slot = useRef<View>(null)
  const [geometry, setGeometry] = useState<Geometry | null>(null)
  const [shine, setShine] = useState<number | null>(null)
  const appear = useSharedValue(0)
  const turn = useSharedValue(0)
  const fade = useSharedValue(1)
  const drag = useSharedValue(0)
  const started = useRef(false)
  const closing = useRef(false)
  const allowRemove = useRef(false)

  // Where the coin settles, and where it starts, both relative to this screen.
  const measure = () =>
    root.current?.measureInWindow((rootX, rootY) =>
      slot.current?.measureInWindow((x, y) => {
        const from = params.origin
        setGeometry({
          target: { x: x - rootX, y: y - rootY },
          origin: from
            ? { x: from.x - rootX, y: from.y - rootY, size: from.size }
            : null,
        })
      })
    )

  useEffect(() => {
    if (!geometry || started.current) return
    started.current = true
    if (reduceMotion) {
      turn.value = 1
      appear.value = withTiming(1, { duration: 240 })
      return
    }
    turn.value = withSpring(1, TURN_SPRING)
    // Light sweeps the metal once it lands; a later re-measure can't cancel it.
    appear.value = withTiming(
      1,
      { duration: OPEN_MS, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished && !locked) scheduleOnRN(setShine, 1)
      }
    )
  }, [appear, geometry, locked, reduceMotion, turn])

  const close = (then?: () => void) => {
    if (closing.current) return
    closing.current = true
    const finish = () => {
      allowRemove.current = true
      if (then) then()
      else navigation.goBack()
    }
    const flyBack =
      !reduceMotion &&
      !!geometry?.origin &&
      params.origin?.returns !== false &&
      drag.value < 1
    if (flyBack) {
      const timing = { duration: CLOSE_MS, easing: Easing.inOut(Easing.cubic) }
      turn.value = withTiming(Math.round(turn.value) - 1, timing)
      appear.value = withTiming(0, timing, () => scheduleOnRN(finish))
      return
    }
    if (drag.value > 0)
      drag.value = withTiming(drag.value + 160, { duration: FADE_MS })
    fade.value = withTiming(
      0,
      { duration: FADE_MS, easing: Easing.in(Easing.quad) },
      // Leaves even when the fade is interrupted, so the view can't get stuck.
      () => scheduleOnRN(finish)
    )
  }

  // Android's back and any other way out play the close first. The listener
  // stays put and calls the latest `close`.
  const latestClose = useRef(close)
  useEffect(() => {
    latestClose.current = close
  })
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (allowRemove.current) return
        event.preventDefault()
        latestClose.current(() => navigation.dispatch(event.data.action))
      }),
    [navigation]
  )

  const spin = () => {
    if (reduceMotion || closing.current || !started.current) return
    Haptics.light()
    turn.value = withSpring(Math.round(turn.value) + 1, TURN_SPRING)
    if (!locked) setShine((count) => (count ?? 0) + 1)
  }

  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetY(-12)
    .failOffsetX([-24, 24])
    .onUpdate((event) => {
      drag.value = Math.max(0, event.translationY)
    })
    .onEnd((event) => {
      if (
        event.translationY > DISMISS_DISTANCE ||
        event.velocityY > DISMISS_VELOCITY
      )
        scheduleOnRN(close)
      else drag.value = withSpring(0, { damping: 18, stiffness: 220 })
    })

  const backdropStyle = useAnimatedStyle(() => ({
    opacity:
      Math.min(appear.value, fade.value) *
      interpolate(drag.value, [0, 600], [1, 0.25], 'clamp'),
  }))
  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drag.value }],
  }))
  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(appear.value, [0.45, 1], [0, 1], 'clamp') * fade.value,
  }))
  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(appear.value, [0.3, 1], [0, 1], 'clamp') * fade.value,
  }))
  const coinStyle = useAnimatedStyle(() => {
    if (!geometry) return { opacity: 0 }
    const p = appear.value
    const f = fade.value
    if (reduceMotion) return { opacity: p * f }
    const from = geometry.origin
    const settle = 0.9 + 0.1 * f
    if (!from) {
      return {
        opacity: Math.min(1, p * 2) * f,
        transform: [
          { perspective: 900 },
          { scale: (0.6 + 0.4 * p) * settle },
          { rotateY: `${turn.value * 360}deg` },
        ],
      }
    }
    const startScale = from.size / coinSize
    return {
      opacity: f,
      transform: [
        { perspective: 900 },
        {
          translateX:
            (from.x + from.size / 2 - (geometry.target.x + coinSize / 2)) *
            (1 - p),
        },
        {
          translateY:
            (from.y + from.size / 2 - (geometry.target.y + coinSize / 2)) *
            (1 - p),
        },
        { scale: (startScale + (1 - startScale) * p) * settle },
        { rotateY: `${turn.value * 360}deg` },
      ],
    }
  })

  const haloSize = coinSize * 1.9
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View
        ref={root}
        collapsable={false}
        accessibilityViewIsModal
        style={{ flex: 1 }}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: surface },
            backdropStyle,
          ]}
        />
        <GestureDetector gesture={pan}>
          <Animated.View style={[StyleSheet.absoluteFill, dragStyle]}>
            {geometry && glow ? (
              <Animated.View
                pointerEvents='none'
                style={[
                  {
                    position: 'absolute',
                    left: geometry.target.x + coinSize / 2 - haloSize / 2,
                    top: geometry.target.y + coinSize / 2 - haloSize / 2,
                    width: haloSize,
                    height: haloSize,
                  },
                  haloStyle,
                ]}
              >
                <Svg width={haloSize} height={haloSize}>
                  <Defs>
                    <RadialGradient
                      id='badgeViewHalo'
                      cx='50%'
                      cy='50%'
                      r='50%'
                    >
                      <Stop
                        offset='0.35'
                        stopColor={glow.color}
                        stopOpacity={scheme === 'light' ? 0.38 : 0.3}
                      />
                      <Stop offset='1' stopColor={glow.color} stopOpacity={0} />
                    </RadialGradient>
                  </Defs>
                  <Circle
                    cx={haloSize / 2}
                    cy={haloSize / 2}
                    r={haloSize / 2}
                    fill='url(#badgeViewHalo)'
                  />
                </Svg>
              </Animated.View>
            ) : null}
            <Animated.View
              style={[
                {
                  flex: 1,
                  paddingTop: insets.top + 8,
                  paddingBottom: insets.bottom + 16,
                },
                contentStyle,
              ]}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                  paddingHorizontal: 16,
                }}
              >
                <Button
                  onPress={() => close()}
                  accessibilityRole='button'
                  accessibilityLabel={i18n.t('close')}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.card,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <LucideIcon
                    icon={XIcon}
                    size={18}
                    color={theme.colors.text}
                  />
                </Button>
              </View>
              <View
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 22,
                }}
              >
                {owner ? (
                  <View
                    accessible
                    accessibilityLabel={i18n.t('badges_ownerBadge', {
                      name: owner.name,
                    })}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingVertical: 4,
                      paddingLeft: 4,
                      paddingRight: 12,
                      borderRadius: 18,
                      backgroundColor: theme.colors.card,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    {owner.avatar}
                    <Text
                      numberOfLines={1}
                      style={{
                        maxWidth: width * 0.6,
                        fontSize: 14,
                        fontFamily: theme.fonts.semiBold,
                        color: theme.colors.text,
                      }}
                    >
                      {i18n.t('badges_ownerBadge', { name: owner.name })}
                    </Text>
                  </View>
                ) : null}
                <View
                  ref={slot}
                  collapsable={false}
                  onLayout={measure}
                  style={{ width: coinSize, height: coinSize }}
                />
                <BadgeViewDetails
                  art={art}
                  level={level}
                  locked={locked}
                  record={record}
                  count={live?.count ?? null}
                />
                {mine && collection && !locked ? (
                  <BadgeViewStatus
                    art={collection}
                    next={nextLevel(currentLevel)}
                    count={live?.count ?? null}
                  />
                ) : null}
              </View>
              {footer ? (
                <View style={{ paddingHorizontal: 20, paddingBottom: 18 }}>
                  {footer}
                </View>
              ) : null}
              <BadgeWordmark />
            </Animated.View>
            {geometry ? (
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    left: geometry.target.x,
                    top: geometry.target.y,
                    width: coinSize,
                    height: coinSize,
                  },
                  coinStyle,
                ]}
              >
                <PointerHover effect='lift'>
                  <Pressable
                    onPress={spin}
                    accessible={false}
                    importantForAccessibility='no'
                    style={{ borderRadius: coinSize / 2 }}
                  >
                    <BadgeViewCoin
                      art={art}
                      level={level}
                      size={coinSize}
                      state={state}
                      turn={turn}
                      shine={reduceMotion ? null : shine}
                    />
                  </Pressable>
                </PointerHover>
              </Animated.View>
            ) : null}
          </Animated.View>
        </GestureDetector>
      </View>
    </GestureHandlerRootView>
  )
}
