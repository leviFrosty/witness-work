import { useEffect, useLayoutEffect, useRef } from 'react'
import { ScrollView, View } from 'react-native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import Header from '@/components/ui/layout/Header'
import Wrapper from '@/components/ui/layout/Wrapper'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { RootStackParamList } from '@/types/rootStack'
import BuddiesPetVisitsSection from '@/features/buddies/components/BuddiesPetVisitsSection'
import BuddiesCalendarSettingsSection from '@/features/buddies/components/BuddiesCalendarSettingsSection'
import BuddiesDeleteDataButton from '@/features/buddies/components/BuddiesDeleteDataButton'
import BuddiesNotificationsSection from '@/features/buddies/components/BuddiesNotificationsSection'
import BuddiesPausedNotice from '@/features/buddies/components/BuddiesPausedNotice'
import BuddiesPlansSharingSection from '@/features/buddies/components/BuddiesPlansSharingSection'
import BuddiesSharingSection from '@/features/buddies/components/BuddiesSharingSection'
import BuddySettingsScopeBar from '@/features/buddies/components/BuddySettingsScopeBar'
import BuddySettingsUndoButton from '@/features/buddies/components/BuddySettingsUndoButton'
import {
  BuddySettingsScope,
  recordBuddySettingsUndo,
  useBuddySettingsUndos,
} from '@/features/buddies/hooks/useBuddySettingsScope'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

type Props = NativeStackScreenProps<RootStackParamList, 'Buddies Settings'>

/**
 * All Buddies' settings, or one buddy's over them (`inboxId`), picked at the
 * top: what buddies see, their Plans on the calendar, and alerts here. Each row
 * says where its value comes from. Undo in the header takes back this visit's
 * changes, newest first. All Buddies' page also holds the pause, Buddies
 * notifications, feedback, and deleting everything.
 */
export default function BuddiesSettingsScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const inboxId = route.params?.inboxId ?? null
  const buddy =
    useBuddies((state) =>
      state.buddies.find(
        (candidate) =>
          candidate.inboxId === inboxId && candidate.status === 'active'
      )
    ) ?? null
  const scroll = useRef<ScrollView>(null)

  const select = (next: string | null) =>
    navigation.setParams({ inboxId: next ?? undefined })
  // A new scope starts at the top.
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false })
  }, [inboxId])
  // This visit's changes only.
  useEffect(() => {
    useBuddySettingsUndos.setState({ undos: [] })
    return () => useBuddySettingsUndos.setState({ undos: [] })
  }, [])
  const resetAll = () => {
    if (!buddy) return
    const { inboxId: id, overrides } = buddy
    const alerts = useBuddies.getState().alertOverrides[id]
    analytics.capture('buddies_setting_reset', {
      setting: 'all',
      scope: 'buddy',
    })
    recordBuddySettingsUndo({
      inboxId: id,
      revert: () => {
        buddiesEngine
          .setBuddyOverrides(id, () => overrides)
          .catch((error) => logger.warn('[buddies] settings', error))
        buddiesEngine.setBuddyAlerts(id, () => alerts)
      },
    })
    buddiesEngine
      .setBuddyOverrides(id, () => undefined)
      .catch((error) => logger.warn('[buddies] settings', error))
    buddiesEngine.setBuddyAlerts(id, () => undefined)
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <Header
          buttonType='back'
          title={i18n.t('buddies_settingsTitle')}
          rightElement={
            <View style={{ position: 'absolute', right: 0 }}>
              <BuddySettingsUndoButton
                // Back to where it was made, so the change is seen going back.
                onUndone={(where) =>
                  navigation.setParams({ inboxId: where ?? undefined })
                }
              />
            </View>
          }
        />
      ),
    })
  }, [navigation])

  return (
    <Wrapper insets='bottom' style={{ flex: 1 }}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={{
          gap: 24,
          paddingVertical: 20,
          paddingHorizontal: 15,
          width: '100%',
          maxWidth: 720,
          alignSelf: 'center',
        }}
      >
        <BuddySettingsScopeBar
          buddy={buddy}
          onSelect={select}
          onResetAll={resetAll}
        />
        <BuddySettingsScope
          buddy={buddy}
          record={recordBuddySettingsUndo}
          select={select}
        >
          {buddy && <BuddiesPausedNotice />}
          <BuddiesSharingSection />
          <BuddiesPlansSharingSection />
          <BuddiesCalendarSettingsSection />
          <BuddiesPetVisitsSection />
          <BuddiesNotificationsSection />
        </BuddySettingsScope>
        {!buddy && (
          <>
            <Button
              onPress={() =>
                navigation.navigate('Buddies Feedback', { source: 'settings' })
              }
              style={{ alignSelf: 'center' }}
            >
              <Text style={{ color: theme.colors.accent }}>
                {i18n.t('buddies_sendFeedback')}
              </Text>
            </Button>
            <BuddiesDeleteDataButton />
          </>
        )}
      </ScrollView>
    </Wrapper>
  )
}
