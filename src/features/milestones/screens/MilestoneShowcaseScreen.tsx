import { useCallback, useEffect } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import {
  faAddressCard,
  faArrowsRotate,
  faBell,
  faBurst,
  faCalendarDays,
  faCamera,
  faClockRotateLeft,
  faCloud,
  faForward,
  faGift,
  faHeart,
  faIcons,
  faMapPin,
  faPalette,
  faStar,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { BlurView } from 'expo-blur'
import Constants from 'expo-constants'
import { Image as ExpoImage } from 'expo-image'
import Text from '../../../components/MyText'
import IconButton from '../../../components/IconButton'
import ActionButton from '../../../components/ActionButton'
import useTheme from '../../../contexts/theme'
import i18n, { TranslationKey } from '../../../lib/locales'
import { usePreferences } from '../../../stores/preferences'
import { RootStackNavigation } from '../../../types/rootStack'

const HERO_FEATURES = [
  'liquidGlass',
  'widgets',
  'progress',
  'contacts',
  'iCloudSync',
] as const

const SECONDARY_FEATURES: { id: string; icon: typeof faStar }[] = [
  { id: 'rollover', icon: faForward },
  { id: 'avatars', icon: faCamera },
  { id: 'sharing', icon: faAddressCard },
  { id: 'onboardingFounder', icon: faHeart },
  { id: 'fireworks', icon: faBurst },
  { id: 'missedConversations', icon: faBell },
  { id: 'followUpRework', icon: faClockRotateLeft },
  { id: 'recurring', icon: faArrowsRotate },
  { id: 'supporter', icon: faStar },
  { id: 'appIcon', icon: faIcons },
  { id: 'schedule', icon: faCalendarDays },
  { id: 'shaders', icon: faPalette },
  { id: 'mapEmpty', icon: faMapPin },
]

/**
 * Magazine-style "what's new" presentation for The Milestone Update. Hosts a
 * vertical scroll of hero feature blocks (animated illustrations) followed by a
 * card grid of secondary features and a closing thank-you. Marks the reveal as
 * fully seen on dismiss so the home-screen "shaking present" affordance goes
 * away.
 */
const MilestoneShowcaseScreen = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  const { set } = usePreferences()

  const markSeen = useCallback(() => {
    set({
      seenMilestoneUpdateReveal: true,
      dismissedMilestoneRevealOnce: false,
    })
  }, [set])

  // Mark seen on every dismissal path — explicit close, swipe-back, CTA. We
  // don't wait for scroll-to-bottom because users who skim still saw the
  // showcase and shouldn't get nagged by the shaking present.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', markSeen)
    return unsubscribe
  }, [navigation, markSeen])

  const handleClose = useCallback(() => {
    markSeen()
    if (navigation.canGoBack()) {
      navigation.goBack()
    } else {
      navigation.navigate('Root')
    }
  }, [markSeen, navigation])

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={[styles.closeRow, { paddingHorizontal: 16 }]}>
        <IconButton
          onPress={handleClose}
          size={20}
          icon={faXmark}
          color={theme.colors.text}
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 60,
          paddingHorizontal: 20,
          gap: 28,
        }}
        showsVerticalScrollIndicator={false}
      >
        <ShowcaseHeader />

        {HERO_FEATURES.map((id, index) => (
          <HeroSection key={id} id={id} index={index} />
        ))}

        <SecondaryGrid />

        <ClosingThanks onClose={handleClose} />
      </ScrollView>
    </View>
  )
}

/* ─── Header ───────────────────────────────────────────────────────────── */

const ShowcaseHeader = () => {
  const theme = useTheme()

  const opacity = useSharedValue(0)
  const translateY = useSharedValue(20)

  useEffect(() => {
    opacity.value = withTiming(1, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    })
    translateY.value = withTiming(0, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    })
  }, [opacity, translateY])

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }))

  return (
    <Animated.View style={[styles.header, style]}>
      <View
        style={[styles.kicker, { backgroundColor: theme.colors.accent + '22' }]}
      >
        <FontAwesomeIcon icon={faGift} size={11} color={theme.colors.accent} />
        <Text
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.semiBold,
            fontSize: 11,
            letterSpacing: 1.2,
          }}
        >
          {i18n.t('milestoneShowcase_kicker')}
        </Text>
      </View>
      <Text
        style={[
          styles.headerTitle,
          { color: theme.colors.text, fontFamily: theme.fonts.bold },
        ]}
      >
        {i18n.t('milestoneReveal_title')}
      </Text>
      <Text style={[styles.headerSubtitle, { color: theme.colors.textAlt }]}>
        {`v${Constants.expoConfig?.version ?? ''} · ${i18n.t('milestoneShowcase_subtitle')}`}
      </Text>
    </Animated.View>
  )
}

/* ─── Hero sections ────────────────────────────────────────────────────── */

interface HeroSectionProps {
  id: (typeof HERO_FEATURES)[number]
  index: number
}

const HeroSection = ({ id, index }: HeroSectionProps) => {
  const theme = useTheme()

  const opacity = useSharedValue(0)
  const translateY = useSharedValue(40)

  useEffect(() => {
    const delay = 250 + index * 120
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })
    )
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) })
    )
  }, [opacity, translateY, index])

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }))

  // Widgets is the headline crowd-pleaser — give it a taller stage so the
  // home-screen mock can breathe. Other heroes stay at the standard size.
  const visualHeight = id === 'widgets' ? 260 : 180

  return (
    <Animated.View style={[styles.hero, style]}>
      <View
        style={[
          styles.heroVisual,
          {
            height: visualHeight,
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <HeroVisual id={id} />
      </View>
      <View style={styles.heroText}>
        <Text
          style={[
            styles.heroTitle,
            { color: theme.colors.text, fontFamily: theme.fonts.bold },
          ]}
        >
          {i18n.t(`milestoneHero_${id}_title` as TranslationKey)}
        </Text>
        <Text style={[styles.heroDescription, { color: theme.colors.textAlt }]}>
          {i18n.t(`milestoneHero_${id}_description` as TranslationKey)}
        </Text>
      </View>
    </Animated.View>
  )
}

const HeroVisual = ({ id }: { id: (typeof HERO_FEATURES)[number] }) => {
  switch (id) {
    case 'liquidGlass':
      return <LiquidGlassVisual />
    case 'widgets':
      return <WidgetsVisual />
    case 'progress':
      return <ProgressVisual />
    case 'contacts':
      return <ContactsVisual />
    case 'iCloudSync':
      return <ICloudSyncVisual />
  }
}

/* ─── Hero #1: Liquid Glass tab bar ─────────────────────────────────────── */

const LiquidGlassVisual = () => {
  const theme = useTheme()
  const pulse = useSharedValue(0)

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    )
    return () => cancelAnimation(pulse)
  }, [pulse])

  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + pulse.value * 0.45,
    transform: [{ scale: 0.92 + pulse.value * 0.18 }],
  }))

  return (
    <View style={styles.glassStage}>
      <View
        style={[
          styles.glassPill,
          {
            backgroundColor: theme.colors.background + 'EE',
            borderColor: theme.colors.border,
          },
        ]}
      >
        <BlurView
          tint={theme.colors.background === '#121212' ? 'dark' : 'light'}
          intensity={50}
          style={StyleSheet.absoluteFill}
        />
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.glassDotWrap}>
            {i === 1 ? (
              <Animated.View
                style={[
                  styles.glassDotActive,
                  { backgroundColor: theme.colors.accent },
                  dotStyle,
                ]}
              />
            ) : (
              <View
                style={[
                  styles.glassDot,
                  { backgroundColor: theme.colors.textAlt + '66' },
                ]}
              />
            )}
          </View>
        ))}
      </View>
      <View
        style={[
          styles.glassAccessory,
          {
            backgroundColor: theme.colors.accent,
          },
        ]}
      >
        <Text
          style={{
            color: theme.colors.textInverse,
            fontSize: 18,
            fontWeight: '700',
          }}
        >
          +
        </Text>
      </View>
    </View>
  )
}

/* ─── Hero #2: Progress milestone bar ───────────────────────────────────── */

const ProgressVisual = () => {
  const theme = useTheme()
  const fill = useSharedValue(0)

  useEffect(() => {
    const snap = (to: number) =>
      withTiming(to, { duration: 600, easing: Easing.out(Easing.cubic) })
    const hold = (to: number) => withTiming(to, { duration: 500 })
    fill.value = withRepeat(
      withSequence(
        snap(0.25),
        hold(0.25),
        snap(0.5),
        hold(0.5),
        snap(0.75),
        hold(0.75),
        snap(1),
        hold(1),
        withTiming(0, { duration: 500, easing: Easing.in(Easing.cubic) })
      ),
      -1,
      false
    )
    return () => cancelAnimation(fill)
  }, [fill])

  const barStyle = useAnimatedStyle(() => ({
    width: `${fill.value * 100}%`,
  }))

  return (
    <View style={styles.progressStage}>
      <View
        style={[
          styles.progressTrack,
          { backgroundColor: theme.colors.textAlt + '33' },
        ]}
      >
        <Animated.View
          style={[
            styles.progressFill,
            { backgroundColor: theme.colors.accent },
            barStyle,
          ]}
        />
        {[0.25, 0.5, 0.75, 1].map((stop, i) => (
          <View
            key={i}
            style={[
              styles.progressMarker,
              {
                left: `${stop * 100}%`,
                backgroundColor: theme.colors.background,
                borderColor: theme.colors.accent,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.progressLabels}>
        {[
          { stop: 0.25, label: '25' },
          { stop: 0.5, label: '50' },
          { stop: 0.75, label: '75' },
          { stop: 1, label: '100' },
        ].map(({ stop, label }) => (
          <View
            key={label}
            style={[styles.progressLabelWrap, { left: `${stop * 100}%` }]}
          >
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: 11,
                fontFamily: theme.fonts.semiBold,
                textAlign: 'center',
              }}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

/* ─── Hero #3: Contacts tab ─────────────────────────────────────────────── */

const ContactsVisual = () => {
  const theme = useTheme()
  const filter = useSharedValue(0)

  useEffect(() => {
    filter.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 1200 }),
        withTiming(0, { duration: 600, easing: Easing.in(Easing.cubic) }),
        withTiming(0, { duration: 600 })
      ),
      -1,
      false
    )
    return () => cancelAnimation(filter)
  }, [filter])

  const pillStyle = useAnimatedStyle(() => ({
    opacity: filter.value,
    transform: [{ translateX: -10 + filter.value * 10 }],
  }))

  return (
    <View style={styles.contactsStage}>
      <View
        style={[
          styles.contactsSearch,
          {
            backgroundColor: theme.colors.background,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: theme.colors.textAlt,
          }}
        />
        <View
          style={{
            flex: 1,
            height: 6,
            borderRadius: 3,
            backgroundColor: theme.colors.textAlt + '44',
          }}
        />
        <Animated.View
          style={[
            styles.contactsFilterPill,
            { backgroundColor: theme.colors.accent },
            pillStyle,
          ]}
        >
          <Text
            style={{
              color: theme.colors.textInverse,
              fontSize: 9,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            BIBLE STUDY
          </Text>
        </Animated.View>
      </View>

      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[
            styles.contactsRow,
            {
              backgroundColor: theme.colors.background,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.contactsAvatar,
              { backgroundColor: theme.colors.accent + '88' },
            ]}
          >
            <FontAwesomeIcon
              icon={faCamera}
              size={10}
              color={theme.colors.textInverse}
            />
          </View>
          <View style={{ gap: 4, flex: 1 }}>
            <View
              style={{
                height: 6,
                width: '50%',
                borderRadius: 3,
                backgroundColor: theme.colors.text + '99',
              }}
            />
            <View
              style={{
                height: 5,
                width: '70%',
                borderRadius: 3,
                backgroundColor: theme.colors.textAlt + '55',
              }}
            />
          </View>
        </View>
      ))}
    </View>
  )
}

/* ─── Hero #4: iCloud sync ──────────────────────────────────────────────── */

const ICloudSyncVisual = () => {
  const theme = useTheme()
  const flow = useSharedValue(0)

  useEffect(() => {
    flow.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.cubic) }),
      -1,
      true
    )
    return () => cancelAnimation(flow)
  }, [flow])

  const cloudStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -2 + flow.value * 4 }],
  }))

  return (
    <View style={styles.cloudStage}>
      <DeviceMock kind='phone' side='left' theme={theme} />
      <Animated.View style={[styles.cloudIcon, cloudStyle]}>
        <FontAwesomeIcon icon={faCloud} size={36} color={theme.colors.accent} />
        <View style={styles.cloudDots}>
          {[0, 1, 2].map((i) => (
            <CloudDot
              key={i}
              index={i}
              flow={flow}
              color={theme.colors.accent}
            />
          ))}
        </View>
      </Animated.View>
      <DeviceMock kind='tablet' side='right' theme={theme} />
    </View>
  )
}

const CloudDot = ({
  index,
  flow,
  color,
}: {
  index: number
  flow: SharedValue<number>
  color: string
}) => {
  const style = useAnimatedStyle(() => {
    const phase = (flow.value + index * 0.33) % 1
    return {
      opacity: 0.2 + phase * 0.8,
      transform: [{ scale: 0.8 + phase * 0.4 }],
    }
  })
  return (
    <Animated.View
      style={[styles.cloudDot, { backgroundColor: color }, style]}
    />
  )
}

const DeviceMock = ({
  kind,
  side,
  theme,
}: {
  kind: 'phone' | 'tablet'
  side: 'left' | 'right'
  theme: ReturnType<typeof useTheme>
}) => {
  const dimensions =
    kind === 'phone'
      ? { width: 50, height: 86, borderRadius: 12, screenRadius: 6, padding: 6 }
      : { width: 78, height: 98, borderRadius: 10, screenRadius: 5, padding: 7 }
  return (
    <View
      style={[
        styles.deviceMock,
        {
          width: dimensions.width,
          height: dimensions.height,
          borderRadius: dimensions.borderRadius,
          padding: dimensions.padding,
          backgroundColor: theme.colors.background,
          borderColor: theme.colors.border,
          marginLeft: side === 'left' ? 0 : 'auto',
          marginRight: side === 'right' ? 0 : 'auto',
        },
      ]}
    >
      <View
        style={[
          styles.deviceScreen,
          {
            borderRadius: dimensions.screenRadius,
            backgroundColor: theme.colors.accent + '22',
          },
        ]}
      />
    </View>
  )
}

/* ─── Hero #5: Widgets ──────────────────────────────────────────────────── */

const WidgetsVisual = () => {
  const theme = useTheme()
  const intro = useSharedValue(0)
  const fill = useSharedValue(0)
  const dayPulse = useSharedValue(0)
  const dotPulse = useSharedValue(0)

  useEffect(() => {
    // Cascading entrance — staggered by widget index in the visual.
    intro.value = withTiming(1, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    })
    // Hours-widget progress arc fills repeatedly so the page feels alive even
    // mid-scroll.
    fill.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.cubic) }),
        withTiming(1, { duration: 600 }),
        withTiming(0, { duration: 600 })
      ),
      -1,
      false
    )
    // Highlighted calendar day breathes.
    dayPulse.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    )
    // Contacts widget "new" dot pulses on a slower cycle.
    dotPulse.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    )
    return () => {
      cancelAnimation(intro)
      cancelAnimation(fill)
      cancelAnimation(dayPulse)
      cancelAnimation(dotPulse)
    }
  }, [intro, fill, dayPulse, dotPulse])

  const calendarStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, intro.value * 1.5),
    transform: [{ translateY: 20 - intro.value * 20 }],
  }))
  const hoursStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, intro.value * 1.5 - 0.3),
    transform: [{ translateY: 20 - intro.value * 20 }],
  }))
  const contactsStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, intro.value * 1.5 - 0.6),
    transform: [{ translateY: 20 - intro.value * 20 }],
  }))
  const arcStyle = useAnimatedStyle(() => ({
    width: `${30 + fill.value * 60}%`,
  }))
  const dayStyle = useAnimatedStyle(() => ({
    opacity: 0.7 + dayPulse.value * 0.3,
    transform: [{ scale: 0.95 + dayPulse.value * 0.1 }],
  }))
  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + dotPulse.value * 0.5,
    transform: [{ scale: 0.85 + dotPulse.value * 0.3 }],
  }))

  return (
    <View style={styles.widgetsStage}>
      <View style={styles.widgetsRow}>
        {/* Calendar widget (small) */}
        <Animated.View
          style={[
            styles.widgetSmall,
            {
              backgroundColor: theme.colors.background,
              borderColor: theme.colors.border,
            },
            calendarStyle,
          ]}
        >
          <Text style={[styles.widgetLabel, { color: theme.colors.textAlt }]}>
            APR
          </Text>
          <View style={styles.calendarGrid}>
            {Array.from({ length: 12 }).map((_, i) => {
              const isHighlighted = i === 5
              if (isHighlighted) {
                return (
                  <Animated.View
                    key={i}
                    style={[
                      styles.calendarCell,
                      {
                        backgroundColor: theme.colors.accent,
                      },
                      dayStyle,
                    ]}
                  />
                )
              }
              return (
                <View
                  key={i}
                  style={[
                    styles.calendarCell,
                    {
                      backgroundColor: theme.colors.textAlt + '33',
                    },
                  ]}
                />
              )
            })}
          </View>
        </Animated.View>

        {/* Hours widget (small) */}
        <Animated.View
          style={[
            styles.widgetSmall,
            {
              backgroundColor: theme.colors.background,
              borderColor: theme.colors.border,
            },
            hoursStyle,
          ]}
        >
          <Text style={[styles.widgetLabel, { color: theme.colors.textAlt }]}>
            HOURS
          </Text>
          <Text
            style={[
              styles.widgetBigNumber,
              {
                color: theme.colors.text,
                fontFamily: theme.fonts.bold,
              },
            ]}
          >
            12.5
          </Text>
          <View
            style={[
              styles.widgetTrack,
              { backgroundColor: theme.colors.textAlt + '33' },
            ]}
          >
            <Animated.View
              style={[
                styles.widgetTrackFill,
                { backgroundColor: theme.colors.accent },
                arcStyle,
              ]}
            />
          </View>
        </Animated.View>
      </View>

      {/* Contacts/Appointments widget (medium-wide) */}
      <Animated.View
        style={[
          styles.widgetMedium,
          {
            backgroundColor: theme.colors.background,
            borderColor: theme.colors.border,
          },
          contactsStyle,
        ]}
      >
        <View style={styles.widgetMediumHeader}>
          <Text style={[styles.widgetLabel, { color: theme.colors.textAlt }]}>
            UP NEXT
          </Text>
          <Animated.View
            style={[
              styles.widgetNewDot,
              { backgroundColor: theme.colors.accent },
              dotStyle,
            ]}
          />
        </View>
        {[0, 1].map((i) => (
          <View key={i} style={styles.widgetRow}>
            <View
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: theme.colors.accent + (i === 0 ? 'CC' : '66'),
              }}
            />
            <View style={{ flex: 1, gap: 3 }}>
              <View
                style={{
                  height: 5,
                  width: i === 0 ? '60%' : '45%',
                  borderRadius: 3,
                  backgroundColor: theme.colors.text + 'AA',
                }}
              />
              <View
                style={{
                  height: 4,
                  width: i === 0 ? '40%' : '30%',
                  borderRadius: 2,
                  backgroundColor: theme.colors.textAlt + '66',
                }}
              />
            </View>
          </View>
        ))}
      </Animated.View>
    </View>
  )
}

/* ─── Secondary grid ────────────────────────────────────────────────────── */

const SecondaryGrid = () => {
  const theme = useTheme()
  return (
    <View style={{ gap: 14, marginTop: 16 }}>
      <Text
        style={[
          styles.secondaryHeading,
          { color: theme.colors.text, fontFamily: theme.fonts.bold },
        ]}
      >
        {i18n.t('milestoneShowcase_andMuchMore')}
      </Text>
      <View style={styles.secondaryGrid}>
        {SECONDARY_FEATURES.map((feature) => (
          <SecondaryCard key={feature.id} {...feature} />
        ))}
      </View>
    </View>
  )
}

const SecondaryCard = ({ id, icon }: { id: string; icon: typeof faStar }) => {
  const theme = useTheme()
  return (
    <View
      style={[
        styles.secondaryCard,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View
        style={[
          styles.secondaryIcon,
          { backgroundColor: theme.colors.accent + '1F' },
        ]}
      >
        <FontAwesomeIcon icon={icon} size={14} color={theme.colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.semiBold,
            fontSize: 13,
          }}
        >
          {i18n.t(`milestoneSecondary_${id}_title` as TranslationKey)}
        </Text>
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: 11,
          }}
        >
          {i18n.t(`milestoneSecondary_${id}_description` as TranslationKey)}
        </Text>
      </View>
    </View>
  )
}

/* ─── Closing thanks ───────────────────────────────────────────────────── */

const ClosingThanks = ({ onClose }: { onClose: () => void }) => {
  const theme = useTheme()
  return (
    <View style={styles.closing}>
      <Text
        style={[
          styles.closingTitle,
          { color: theme.colors.text, fontFamily: theme.fonts.bold },
        ]}
      >
        {i18n.t('milestoneShowcase_closingTitle')}
      </Text>
      <Text style={[styles.closingBody, { color: theme.colors.textAlt }]}>
        {i18n.t('milestoneShowcase_closingBody')}
      </Text>
      <View style={styles.closingSignature}>
        <ExpoImage
          source={require('../../../assets/signature.png')}
          style={styles.closingSignatureImage}
          contentFit='contain'
          cachePolicy='memory-disk'
          tintColor={theme.colors.text}
        />
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.medium,
          }}
        >
          {i18n.t('founderNoteSignOff')}
        </Text>
      </View>
      <View style={{ marginTop: 12 }}>
        <ActionButton onPress={onClose}>
          {i18n.t('milestoneShowcase_done')}
        </ActionButton>
      </View>
    </View>
  )
}

/* ─── Styles ───────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  closeRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 24,
    marginRight: 5,
    paddingBottom: 10,
  },
  header: {
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
  },
  kicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  headerTitle: {
    fontSize: 32,
    letterSpacing: -1,
    textAlign: 'center',
    lineHeight: 38,
  },
  headerSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    letterSpacing: 0.6,
  },
  hero: {
    gap: 16,
  },
  heroVisual: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroText: {
    gap: 6,
    paddingHorizontal: 4,
  },
  heroTitle: {
    fontSize: 22,
    letterSpacing: -0.5,
  },
  heroDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  /* glass */
  glassStage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  glassPill: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
  },
  glassDotWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  glassDotActive: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  glassAccessory: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* progress */
  progressStage: {
    width: '100%',
    paddingHorizontal: 24,
    gap: 14,
  },
  progressTrack: {
    height: 14,
    borderRadius: 7,
    overflow: 'visible',
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    borderRadius: 7,
  },
  progressMarker: {
    position: 'absolute',
    top: -3,
    width: 10,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    marginLeft: -5,
  },
  progressLabels: {
    position: 'relative',
    height: 14,
  },
  progressLabelWrap: {
    position: 'absolute',
    top: 0,
    width: 40,
    marginLeft: -20,
    alignItems: 'center',
  },
  /* contacts */
  contactsStage: {
    width: '100%',
    paddingHorizontal: 18,
    gap: 8,
  },
  contactsSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  contactsFilterPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  contactsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  contactsAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* iCloud */
  cloudStage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 24,
  },
  cloudIcon: {
    alignItems: 'center',
    gap: 8,
  },
  cloudDots: {
    flexDirection: 'row',
    gap: 6,
  },
  cloudDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  deviceMock: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  deviceScreen: {
    flex: 1,
  },
  /* widgets */
  widgetsStage: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
    alignItems: 'center',
  },
  widgetsRow: {
    flexDirection: 'row',
    gap: 10,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  widgetSmall: {
    width: 96,
    height: 96,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    justifyContent: 'space-between',
  },
  widgetMedium: {
    width: '100%',
    maxWidth: 202,
    alignSelf: 'center',
    height: 96,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    gap: 6,
  },
  widgetMediumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  widgetLabel: {
    fontSize: 9,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  widgetBigNumber: {
    fontSize: 28,
    letterSpacing: -1,
    lineHeight: 30,
  },
  widgetTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  widgetTrackFill: {
    height: '100%',
    borderRadius: 3,
  },
  widgetNewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  widgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  calendarCell: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  /* secondary */
  secondaryHeading: {
    fontSize: 18,
    letterSpacing: -0.4,
  },
  secondaryGrid: {
    gap: 8,
  },
  secondaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* closing */
  closing: {
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 24,
    alignItems: 'stretch',
  },
  closingTitle: {
    fontSize: 22,
    letterSpacing: -0.4,
  },
  closingBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  closingSignature: {
    alignItems: 'flex-start',
    marginTop: 4,
    gap: 2,
  },
  closingSignatureImage: {
    width: 140,
    height: 50,
  },
})

export default MilestoneShowcaseScreen
