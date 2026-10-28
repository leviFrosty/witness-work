import { createContext, ReactNode, useContext, useState } from 'react'
import {
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native'
import { BlurView } from '@/components/ui/BlurView'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import Text from '@/components/ui/MyText'
import AccountMenu from '@/components/AccountMenu'
import SidebarToggle from '@/components/ui/SidebarToggle'
import { isRtlLayout } from '@/lib/direction'
import { transparentToScreenReaders } from '@/lib/screenReader'
import WindowControlsInsetView, {
  NO_WINDOW_CONTROLS,
} from '../../modules/window-controls'

/**
 * Room past a windowed iPad app's window controls. The system's inset ends
 * right at them, and the bell's unread badge hangs off its corner, which is the
 * edge beside the controls when the app and the system read in different
 * directions (Arabic on an English iPad).
 */
const clearOf = (inset: number) => (inset > 0 ? inset + 8 : 0)

/**
 * Side padding on iPhone Duo's inner display. Nothing insets the side away from
 * the vertical bar, so the avatar would sit in the display's large rounded
 * corner; this clears it and lines the header up with the wide content.
 */
const VERTICAL_BAR_WIDE_PADDING = 24

/** How far the title may shrink so an action can show its label. */
const TITLE_MIN_FIT_SCALE = 0.9

/**
 * The width the title's slot has and the width the title should keep, so an
 * action can show its label only while the title still fits.
 */
type TitleFit = { room: number; needs: number }

const TitleFitContext = createContext<TitleFit | undefined>(undefined)

/** Undefined outside a root header's actions, or until it's laid out. */
export const useRootHeaderTitleFit = () => useContext(TitleFitContext)

/** Applied to every spacing change when the header compacts or expands. */
const FLOAT_TRANSITION = {
  transitionDuration: 260,
  transitionTimingFunction: 'ease-in-out',
} as const

type Props = {
  /** Names the section, not its contents (dates belong in `children`). */
  title: string
  /** One or two section-specific actions on the trailing side. */
  actions?: ReactNode
  /**
   * Local controls under the title, e.g. rows of filter chips. They span the
   * header's full width so rows can scroll edge to edge, and bring their own
   * spacing.
   */
  children?: ReactNode
  /** Constrains the header to the screen's content column. */
  contentStyle?: StyleProp<ViewStyle>
  /** E.g. bringing a compacted header back to full size. */
  onPressTitle?: () => void
  /** Hidden dev affordances; no visual chrome. */
  onLongPressTitle?: () => void
  /**
   * Floats over full-bleed content (e.g. the map): swaps the solid backdrop for
   * a translucent blur. The caller positions it.
   */
  floating?: boolean
  /** Tightens every spacing so the header gets out of the content's way. */
  compact?: boolean
}

/**
 * The shared header for every bottom-bar destination: account avatar, section
 * title, section actions. The avatar holds what used to be scattered across
 * Home's header — Profile, Settings, Support, and Help Center — so it reads the
 * same on every root. While the iPad sidebar shows, the account sits at its
 * foot instead.
 */
export default function RootHeader({
  title,
  actions,
  children,
  contentStyle,
  onPressTitle,
  onLongPressTitle,
  floating = false,
  compact = false,
}: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const isDark = theme.colors.background === '#121212'
  const [titleRoom, setTitleRoom] = useState<number>()
  const [titleWidth, setTitleWidth] = useState<number>()
  const [controls, setControls] = useState(NO_WINDOW_CONTROLS)
  const { isWide, navigationRail, hasSidebar, sidebarVisible } =
    useAdaptiveLayout()
  const titleFit =
    titleRoom === undefined || titleWidth === undefined
      ? undefined
      : { room: titleRoom, needs: titleWidth * TITLE_MIN_FIT_SCALE }
  const titleStyle = {
    fontFamily: theme.fonts.bold,
    fontSize: theme.fontSize('2xl'),
  }

  return (
    <View style={{ width: '100%' }}>
      {floating && (
        <View
          pointerEvents='none'
          style={[
            StyleSheet.absoluteFill,
            {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          <BlurView
            tint={isDark ? 'dark' : 'light'}
            intensity={60}
            style={StyleSheet.absoluteFill}
          />
          {/* Android's BlurView without a blur target is just a tint, so lean
          on a denser fill there to keep the header legible. */}
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor:
                  theme.colors.card + (Platform.OS === 'android' ? 'e6' : '99'),
              },
            ]}
          />
        </View>
      )}
      <Animated.View
        style={[
          {
            paddingTop: insets.top + (compact ? 2 : 8),
            paddingHorizontal:
              navigationRail && isWide ? VERTICAL_BAR_WIDE_PADDING : 15,
            paddingBottom: compact ? 6 : 8,
            gap: compact ? 6 : 12,
            width: '100%',
            alignSelf: 'center',
            transitionProperty: ['paddingTop', 'paddingBottom', 'gap'],
            ...FLOAT_TRANSITION,
          },
          contentStyle,
        ]}
      >
        {/* Keeps the avatar clear of a windowed iPad app's window controls. */}
        <WindowControlsInsetView onInsetsChange={setControls}>
          <Animated.View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              minHeight: compact ? 36 : 44,
              paddingStart: clearOf(controls.start),
              paddingEnd: clearOf(controls.end),
              transitionProperty: 'minHeight',
              ...FLOAT_TRANSITION,
            }}
          >
            <SidebarToggle mode='show' />
            {/* A visible sidebar holds the account at its foot instead. */}
            {hasSidebar && sidebarVisible ? null : <AccountMenu />}
            <Pressable
              onPress={onPressTitle}
              onLongPress={onLongPressTitle}
              disabled={!onPressTitle && !onLongPressTitle}
              delayLongPress={800}
              onLayout={(e) => setTitleRoom(e.nativeEvent.layout.width)}
              style={{ flex: 1 }}
              // Without a press the title itself is the heading, rather than
              // a disabled element around it.
              {...(onPressTitle || onLongPressTitle
                ? { accessibilityRole: 'header' as const }
                : transparentToScreenReaders)}
            >
              {/* Scaled rather than resized so the title shrinks smoothly. */}
              <Animated.View
                style={{
                  // Shrinks toward the title's reading start.
                  transformOrigin: isRtlLayout()
                    ? 'right center'
                    : 'left center',
                  transform: [{ scale: compact ? 0.82 : 1 }],
                  transitionProperty: 'transform',
                  ...FLOAT_TRANSITION,
                }}
              >
                {/* Shrinks a little before it truncates, so a crowded header
              (or larger text) still shows the section's name. */}
                <Text
                  accessibilityRole='header'
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={titleStyle}
                >
                  {title}
                </Text>
              </Animated.View>
            </Pressable>
            {actions && (
              <TitleFitContext value={titleFit}>
                {/* Wide enough that 12pt slops on neighbouring buttons don't
              overlap and steal each other's taps. */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 24,
                  }}
                >
                  {actions}
                </View>
              </TitleFitContext>
            )}
            {actions && (
              // The title at full size, unconstrained, to tell whether it fits.
              <View
                pointerEvents='none'
                accessibilityElementsHidden
                importantForAccessibility='no-hide-descendants'
                style={{
                  position: 'absolute',
                  width: 9999,
                  flexDirection: 'row',
                  opacity: 0,
                }}
              >
                <Text
                  numberOfLines={1}
                  onLayout={(e) => setTitleWidth(e.nativeEvent.layout.width)}
                  style={titleStyle}
                >
                  {title}
                </Text>
              </View>
            )}
          </Animated.View>
        </WindowControlsInsetView>
      </Animated.View>
      {children}
    </View>
  )
}
