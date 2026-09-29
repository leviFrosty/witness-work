import { ReactNode, useCallback, useState } from 'react'
import { Alert, RefreshControl, ScrollView, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ellipsis as EllipsisIcon, Plus as PlusIcon } from 'lucide-react-native'
import IconButton from '@/components/ui/IconButton'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PullDownMenu from '@/components/ui/PullDownMenu'
import { TAB_BAR_HEIGHT } from '@/components/ui/TabBar'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { RootStackNavigation } from '@/types/rootStack'
import BuddiesAlphaBadge from '@/features/buddies/components/BuddiesAlphaBadge'
import BuddiesFeedbackCard from '@/features/buddies/components/BuddiesFeedbackCard'
import BuddiesList from '@/features/buddies/components/BuddiesList'
import BuddiesNotificationsCard from '@/features/buddies/components/BuddiesNotificationsCard'
import BuddiesOnboarding from '@/features/buddies/components/BuddiesOnboarding'
import EnterInviteLink from '@/features/buddies/components/EnterInviteLink'
import useLiveBuddiesSync from '@/features/buddies/hooks/useLiveBuddiesSync'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'
import { refreshBuddyAvatarThumbnail } from '@/features/buddies/lib/buddyProfile'
import { createAndShareInvite } from '@/features/buddies/lib/shareInvite'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/** The Buddies tab: first-visit onboarding, then the buddies list. */
export default function BuddiesScreen({
  profileEditor,
}: {
  /** The Profile editor for onboarding, composed in by the app tier. */
  profileEditor: ReactNode
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  const hasInbox = useBuddies((state) => state.registeredInboxId !== null)
  const needsOnboarding = useBuddies((state) => !state.onboardingComplete)
  const [refreshing, setRefreshing] = useState(false)

  useLiveBuddiesSync()

  // A pull is a deliberate ask, so say why it didn't work.
  const refresh = async () => {
    setRefreshing(true)
    try {
      await buddiesEngine.sync()
    } catch (error) {
      Alert.alert(buddiesErrorMessage(error))
    } finally {
      setRefreshing(false)
    }
  }

  useFocusEffect(
    useCallback(() => {
      // Ready before the first invite so the photo travels with it.
      void refreshBuddyAvatarThumbnail().catch((error) =>
        logger.warn('[buddies] avatar thumbnail', error)
      )
    }, [])
  )

  const invite = () =>
    createAndShareInvite().catch((error) =>
      Alert.alert(buddiesErrorMessage(error))
    )

  if (needsOnboarding) {
    return (
      <BuddiesOnboarding
        profileEditor={profileEditor}
        onDone={() => useBuddies.setState({ onboardingComplete: true })}
      />
    )
  }

  const headerButton = {
    backgroundColor: theme.colors.accentTranslucent,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  }

  return (
    // The list starts below the status bar so the pull-to-refresh spinner
    // isn't hidden behind the Dynamic Island.
    <View
      style={{
        flex: 1,
        paddingTop: insets.top,
        backgroundColor: theme.colors.background,
      }}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          gap: 24,
          paddingTop: 8,
          paddingHorizontal: 15,
          paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 40,
          width: '100%',
          maxWidth: 720,
          alignSelf: 'center',
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={theme.colors.accent}
          />
        }
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text
              style={{
                fontFamily: theme.fonts.bold,
                fontSize: theme.fontSize('2xl'),
              }}
            >
              {i18n.t('buddies_title')}
            </Text>
            <BuddiesAlphaBadge />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PullDownMenu
              analyticsSurface='buddies_header'
              accessibilityLabel={i18n.t('moreActions')}
              actions={[
                [
                  {
                    id: 'show_code',
                    title: i18n.t('buddies_showCode'),
                    systemImage: 'qrcode',
                    onPress: () =>
                      navigation.navigate('Buddy Code', { mode: 'code' }),
                  },
                  {
                    id: 'scan_code',
                    title: i18n.t('buddies_scanCode'),
                    systemImage: 'qrcode.viewfinder',
                    onPress: () =>
                      navigation.navigate('Buddy Code', { mode: 'scan' }),
                  },
                ],
                [
                  {
                    id: 'settings',
                    title: i18n.t('buddies_settingsTitle'),
                    systemImage: 'gearshape',
                    onPress: () => navigation.navigate('Buddies Settings'),
                  },
                ],
              ]}
            >
              <View style={headerButton}>
                <LucideIcon
                  icon={EllipsisIcon}
                  size={theme.fontSize('lg')}
                  color={theme.colors.accent}
                />
              </View>
            </PullDownMenu>
            <IconButton
              icon={PlusIcon}
              size='lg'
              style={headerButton}
              color={theme.colors.accent}
              accessibilityLabel={i18n.t('buddies_inviteA11y')}
              onPress={invite}
            />
          </View>
        </View>
        <EnterInviteLink />
        <BuddiesList onInvite={invite} />
        {hasInbox && <BuddiesNotificationsCard />}
        <BuddiesFeedbackCard />
      </ScrollView>
    </View>
  )
}
