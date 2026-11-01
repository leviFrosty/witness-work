import { useEffect, useRef } from 'react'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import useTheme from '@/contexts/theme'
import useOpenSettings from '@/hooks/useOpenSettings'
import useServiceStreak from '@/hooks/useServiceStreak'
import useUser from '@/hooks/useUser'
import i18n from '@/lib/locales'
import { shownStreak } from '@/lib/serviceStreak'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import { useProfileOverlay } from '@/stores/profileOverlay'
import Avatar from '@/components/ui/Avatar'
import Text from '@/components/ui/MyText'
import PullDownMenu from '@/components/ui/PullDownMenu'
import PointerTooltip from '@/components/ui/PointerTooltip'
import StreakBadge from '@/components/StreakBadge'
import { RootStackNavigation } from '@/types/rootStack'
import { HomeTabStackNavigation } from '@/types/homeStack'

export const ROOT_HEADER_AVATAR_SIZE = 34
const SIDEBAR_AVATAR_SIZE = 32

type AccountNavigation = RootStackNavigation & HomeTabStackNavigation

export default function AccountMenu({
  variant = 'avatar',
  compact = false,
  navigation: givenNavigation,
}: {
  variant?: 'avatar' | 'sidebar'

  compact?: boolean

  navigation?: AccountNavigation
}) {
  const contextNavigation = useNavigation<AccountNavigation>()
  const navigation = givenNavigation ?? contextNavigation
  const openSettings = useOpenSettings(navigation)
  const theme = useTheme()
  const { name, avatar } = useUser()
  const hideDonateHeart = usePreferences((s) => s.hideDonateHeart)
  const showStreaks = usePreferences((s) => s.showStreaks)
  const streak = shownStreak(useServiceStreak())
  const hasCompletedProfileSetup = useProfile((s) => s.hasCompletedProfileSetup)
  const setOverlayOrigin = useProfileOverlay((s) => s.setOrigin)
  const showOverlay = useProfileOverlay((s) => s.show)
  const avatarRef = useRef<View>(null)
  const inSidebar = variant === 'sidebar'

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

  const avatarView = (
    <View
      ref={avatarRef}
      hitSlop={inSidebar ? undefined : 8}
      collapsable={false}
    >
      <Avatar
        avatar={avatar}
        name={name}
        size={inSidebar ? SIDEBAR_AVATAR_SIZE : ROOT_HEADER_AVATAR_SIZE}
      />
      {!hasCompletedProfileSetup && (
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
  )

  const showsName = inSidebar && !compact
  const trigger = showsName ? (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 50,
        paddingHorizontal: 9,
      }}
    >
      {avatarView}
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('md'),
        }}
      >
        {name || i18n.t('accountMenu_profile')}
      </Text>
      {showStreaks && streak > 0 ? (
        <StreakBadge count={streak} size='sm' />
      ) : null}
    </View>
  ) : inSidebar ? (
    <View
      style={{ minHeight: 50, alignItems: 'center', justifyContent: 'center' }}
    >
      {avatarView}
    </View>
  ) : (
    avatarView
  )

  return (
    <PointerTooltip
      label={i18n.t('accountMenu')}
      effect='none'
      enabled={!showsName}
      placement={inSidebar ? 'right' : undefined}
    >
      <PullDownMenu
        accessibilityLabel={
          hasCompletedProfileSetup
            ? i18n.t('accountMenu')
            : `${i18n.t('accountMenu')}, ${i18n.t('profileIncompleteTitle')}`
        }
        fill={showsName}
        pointerEffect={inSidebar ? 'tint' : undefined}
        hoverRadius={inSidebar ? 16 : undefined}
        testID={inSidebar ? 'sidebar-account' : 'account-menu'}
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
              onPress: openSettings,
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
        {trigger}
      </PullDownMenu>
    </PointerTooltip>
  )
}
