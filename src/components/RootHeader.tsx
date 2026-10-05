import { ReactNode, useEffect, useRef } from 'react'
import {
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { BlurView } from 'expo-blur'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import useUser from '@/hooks/useUser'

import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import { useProfileOverlay } from '@/stores/profileOverlay'
import Avatar from '@/components/ui/Avatar'
import Text from '@/components/ui/MyText'
import PullDownMenu from '@/components/ui/PullDownMenu'
import PointerTooltip from '@/components/ui/PointerTooltip'
import { RootStackNavigation } from '@/types/rootStack'
import { HomeTabStackNavigation } from '@/types/homeStack'
import SidebarToggle from '@/components/ui/SidebarToggle'

export const ROOT_HEADER_AVATAR_SIZE = 34

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
  /** Local controls under the title: views, date range, search. */
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
 * same on every root.
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
            paddingHorizontal: 15,
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
        <Animated.View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            minHeight: compact ? 36 : 44,
            transitionProperty: 'minHeight',
            ...FLOAT_TRANSITION,
          }}
        >
          <SidebarToggle mode='show' />
          <AccountMenu />
          <Pressable
            onPress={onPressTitle}
            onLongPress={onLongPressTitle}
            disabled={!onPressTitle && !onLongPressTitle}
            delayLongPress={800}
            style={{ flex: 1 }}
          >
            {/* Scaled rather than resized so the title shrinks smoothly. */}
            <Animated.View
              style={{
                transformOrigin: 'left center',
                transform: [{ scale: compact ? 0.82 : 1 }],
                transitionProperty: 'transform',
                ...FLOAT_TRANSITION,
              }}
            >
              <Text
                accessibilityRole='header'
                numberOfLines={1}
                style={{
                  fontFamily: theme.fonts.bold,
                  fontSize: theme.fontSize('2xl'),
                }}
              >
                {title}
              </Text>
            </Animated.View>
          </Pressable>
          {actions && (
            // Wide enough that 12pt slops on neighbouring buttons don't overlap
            // and steal each other's taps.
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}
            >
              {actions}
            </View>
          )}
        </Animated.View>
        {children}
      </Animated.View>
    </View>
  )
}

function AccountMenu() {
  const navigation = useNavigation<
    RootStackNavigation & HomeTabStackNavigation
  >()
  const { hasSidebar } = useAdaptiveLayout()
  const theme = useTheme()
  const { name, avatar } = useUser()
  const hideDonateHeart = usePreferences((s) => s.hideDonateHeart)
  const hasCompletedProfileSetup = useProfile((s) => s.hasCompletedProfileSetup)
  const setOverlayOrigin = useProfileOverlay((s) => s.setOrigin)
  const showOverlay = useProfileOverlay((s) => s.show)
  const avatarRef = useRef<View>(null)

  // Hands the overlay its origin on idle so it can mount its heavy subtree
  // before any tap — without this, the open spring snaps content in.
  useEffect(() => {
    if (!hasCompletedProfileSetup) return
    const handle = requestIdleCallback(() => {
      avatarRef.current?.measureInWindow((x, y, width, height) =>
        setOverlayOrigin({ x, y, width, height })
      )
    })
    return () => cancelIdleCallback(handle)
  }, [hasCompletedProfileSetup, setOverlayOrigin])

  const openProfile = () =>
    avatarRef.current?.measureInWindow((x, y, width, height) =>
      showOverlay({ x, y, width, height })
    )

  return (
    // The avatar alone doesn't say it holds Settings and Help.
    <PointerTooltip label={i18n.t('accountMenu')} effect='none'>
      <PullDownMenu
        accessibilityLabel={
          hasCompletedProfileSetup
            ? i18n.t('accountMenu')
            : `${i18n.t('accountMenu')}, ${i18n.t('profileIncompleteTitle')}`
        }
        actions={[
          [
            hasCompletedProfileSetup
              ? {
                  id: 'profile',
                  title: i18n.t('accountMenu_profile'),
                  systemImage: 'person.crop.circle',
                  onPress: openProfile,
                }
              : {
                  id: 'profile_setup',
                  title: i18n.t('profileIncompleteTitle'),
                  systemImage: 'person.crop.circle.badge.plus',
                  onPress: () => navigation.navigate('PreferencesPublisher'),
                },
            {
              id: 'settings',
              title: i18n.t('settings'),
              systemImage: 'gearshape',
              // Wide layouts keep Settings in the sidebar beside the open page.
              onPress: () =>
                hasSidebar
                  ? navigation.navigate('Settings')
                  : navigation.navigate('SettingsMenu'),
            },
          ],
          [
            !hideDonateHeart && {
              id: 'support',
              title: i18n.t('accountMenu_support'),
              systemImage: 'heart',
              onPress: () => {
                navigation.navigate('Paywall', { source: 'account_menu' })
              },
            },
            {
              id: 'help_center',
              title: i18n.t('helpCenter'),
              systemImage: 'questionmark.circle',
              onPress: () => navigation.navigate('FAQ'),
            },
          ],
        ]}
      >
        <View ref={avatarRef} hitSlop={8} collapsable={false}>
          <Avatar avatar={avatar} name={name} size={ROOT_HEADER_AVATAR_SIZE} />
          {!hasCompletedProfileSetup && (
            // Asks for profile setup until it's done.
            <View
              style={{
                position: 'absolute',
                top: -1,
                right: -1,
                width: 11,
                height: 11,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: theme.colors.background,
                backgroundColor: theme.colors.accent,
              }}
            />
          )}
        </View>
      </PullDownMenu>
    </PointerTooltip>
  )
}
