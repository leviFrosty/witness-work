import { ReactNode, useCallback, useLayoutEffect, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Ellipsis as EllipsisIcon,
  Plus as PlusIcon,
  QrCode as QrCodeIcon,
} from 'lucide-react-native'
import IconButton from '@/components/ui/IconButton'
import LucideIcon from '@/components/ui/LucideIcon'
import PointerTooltip from '@/components/ui/PointerTooltip'
import PullDownMenu from '@/components/ui/PullDownMenu'
import Header from '@/components/ui/layout/Header'
import RootHeader from '@/components/RootHeader'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { RootStackNavigation } from '@/types/rootStack'
import BuddiesAlphaBadge from '@/features/buddies/components/BuddiesAlphaBadge'
import BuddiesList from '@/features/buddies/components/BuddiesList'
import BuddiesNotificationsCard from '@/features/buddies/components/BuddiesNotificationsCard'
import BuddiesOnboarding from '@/features/buddies/components/BuddiesOnboarding'
import BuddiesPausedNotice from '@/features/buddies/components/BuddiesPausedNotice'
import BuddiesSyncNotice from '@/features/buddies/components/BuddiesSyncNotice'
import EnterInviteLink from '@/features/buddies/components/EnterInviteLink'
import useBuddiesSyncStatus from '@/features/buddies/hooks/useBuddiesSyncStatus'
import useInviteAction from '@/features/buddies/hooks/useInviteAction'
import useLiveBuddiesSync from '@/features/buddies/hooks/useLiveBuddiesSync'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { alertBuddiesError } from '@/features/buddies/lib/buddiesErrorAlert'
import { refreshBuddyAvatarThumbnail } from '@/features/buddies/lib/buddyProfile'
import { syncReadInbox } from '@/features/buddies/lib/syncStatus'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

export default function BuddiesScreen({
  profileEditor,
  asTab = false,
}: {
  profileEditor: (nameInvalid: boolean) => ReactNode

  asTab?: boolean
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  const hasInbox = useBuddies((state) => state.registeredInboxId !== null)
  const needsOnboarding = useBuddies((state) => !state.onboardingComplete)
  const [refreshing, setRefreshing] = useState(false)
  const syncStatus = useBuddiesSyncStatus()
  const { invite, inviting } = useInviteAction()
  const foldColumn = useFoldColumn(720)

  useLiveBuddiesSync()

  const refresh = async () => {
    setRefreshing(true)
    const startedAt = Date.now()
    try {
      await buddiesEngine.sync()
    } catch (error) {
      if (!syncReadInbox(useBuddies.getState().lastSyncAt, startedAt))
        alertBuddiesError(i18n.t('buddies_errorRefreshTitle'), error)
    } finally {
      setRefreshing(false)
    }
  }

  useLayoutEffect(() => {
    if (asTab) return
    const label = i18n.t('buddies_showCode')
    navigation.setOptions({
      header: () => (
        <Header
          buttonType='back'
          title={i18n.t('buddies_title')}
          rightElement={
            !needsOnboarding && (
              <View style={{ position: 'absolute', right: 0 }}>
                <PointerTooltip label={label} effect='none'>
                  <IconButton
                    icon={QrCodeIcon}
                    size='xl'
                    color={theme.colors.text}
                    hitSlop={16}
                    accessibilityLabel={label}
                    onPress={() =>
                      navigation.navigate('Buddy Code', { mode: 'code' })
                    }
                  />
                </PointerTooltip>
              </View>
            )
          }
        />
      ),
    })
  }, [asTab, navigation, needsOnboarding, theme.colors.text])

  const rootHeader = asTab ? (
    <RootHeader
      title={i18n.t('buddies_title')}
      actions={
        needsOnboarding ? null : (
          <PointerTooltip label={i18n.t('buddies_showCode')} effect='none'>
            <IconButton
              icon={QrCodeIcon}
              size='xl'
              color={theme.colors.text}
              frame
              accessibilityLabel={i18n.t('buddies_showCode')}
              onPress={() =>
                navigation.navigate('Buddy Code', { mode: 'code' })
              }
            />
          </PointerTooltip>
        )
      }
    />
  ) : null

  useFocusEffect(
    useCallback(() => {
      void refreshBuddyAvatarThumbnail().catch((error) =>
        logger.warn('[buddies] avatar thumbnail', error)
      )
    }, [])
  )

  if (needsOnboarding) {
    const onboarding = (
      <BuddiesOnboarding
        profileEditor={profileEditor}
        onDone={() => useBuddies.setState({ onboardingComplete: true })}
      />
    )
    if (!rootHeader) return onboarding
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        {rootHeader}
        {onboarding}
      </View>
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
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {rootHeader}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          {
            gap: 24,
            paddingTop: 8,
            paddingHorizontal: 15,
            paddingBottom: insets.bottom + 40,
            width: '100%',
            maxWidth: 720,
            alignSelf: 'center',
          },
          foldColumn,
        ]}
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
          <BuddiesAlphaBadge />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PullDownMenu
              accessibilityLabel={i18n.t('moreActions')}
              actions={[
                [
                  {
                    id: 'feedback',
                    title: i18n.t('buddies_sendFeedback'),
                    systemImage: 'bubble.left.and.bubble.right',
                    onPress: () =>
                      navigation.navigate('Buddies Feedback', {
                        source: 'menu',
                      }),
                  },
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
            {inviting ? (
              <View style={headerButton}>
                <ActivityIndicator
                  color={theme.colors.accent}
                  accessibilityLabel={i18n.t('buddies_creatingInvite')}
                />
              </View>
            ) : (
              <IconButton
                icon={PlusIcon}
                size='lg'
                style={headerButton}
                color={theme.colors.accent}
                accessibilityLabel={i18n.t('buddies_inviteA11y')}
                onPress={invite}
              />
            )}
          </View>
        </View>
        <BuddiesSyncNotice
          notice={syncStatus.notice}
          syncing={syncStatus.syncing}
          onRetry={syncStatus.retry}
        />
        <BuddiesPausedNotice />
        <EnterInviteLink />
        <BuddiesList
          onInvite={invite}
          inviting={inviting}
          loading={syncStatus.firstLoad}
        />
        {hasInbox && <BuddiesNotificationsCard />}
      </ScrollView>
    </View>
  )
}
