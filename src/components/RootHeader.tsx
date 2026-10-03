import { ReactNode } from 'react'
import { Pressable, StyleProp, View, ViewStyle } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import useUser from '@/hooks/useUser'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import Avatar from '@/components/ui/Avatar'
import Text from '@/components/ui/MyText'
import PullDownMenu from '@/components/ui/PullDownMenu'
import { RootStackNavigation } from '@/types/rootStack'
import { HomeTabStackNavigation } from '@/types/homeStack'

export const ROOT_HEADER_AVATAR_SIZE = 34

type Props = {
  /** Names the section, not its contents (dates belong in `children`). */
  title: string
  /** One or two section-specific actions on the trailing side. */
  actions?: ReactNode
  /** Local controls under the title: views, date range, search. */
  children?: ReactNode
  /** Constrains the header to the screen's content column. */
  contentStyle?: StyleProp<ViewStyle>
  /** Hidden dev affordances; no visual chrome. */
  onLongPressTitle?: () => void
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
  onLongPressTitle,
}: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View
      style={[
        {
          paddingTop: insets.top + 8,
          paddingHorizontal: 15,
          paddingBottom: 8,
          gap: 12,
          width: '100%',
          alignSelf: 'center',
        },
        contentStyle,
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          minHeight: 44,
        }}
      >
        <AccountMenu />
        <Pressable
          onLongPress={onLongPressTitle}
          disabled={!onLongPressTitle}
          delayLongPress={800}
          style={{ flex: 1 }}
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
        </Pressable>
        {actions && (
          // Wide enough that 12pt slops on neighbouring buttons don't overlap
          // and steal each other's taps.
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
            {actions}
          </View>
        )}
      </View>
      {children}
    </View>
  )
}

function AccountMenu() {
  const navigation = useNavigation<
    RootStackNavigation & HomeTabStackNavigation
  >()
  const { hasSidebar } = useAdaptiveLayout()
  const { name, avatar } = useUser()
  const hideDonateHeart = usePreferences((s) => s.hideDonateHeart)

  return (
    <PullDownMenu
      analyticsSurface='account_menu'
      accessibilityLabel={i18n.t('accountMenu')}
      actions={[
        [
          {
            id: 'profile',
            title: i18n.t('accountMenu_profile'),
            systemImage: 'person.crop.circle',
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
              analytics.capture('paywall_opened', { source: 'account_menu' })
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
      <View hitSlop={8}>
        <Avatar avatar={avatar} name={name} size={ROOT_HEADER_AVATAR_SIZE} />
      </View>
    </PullDownMenu>
  )
}
