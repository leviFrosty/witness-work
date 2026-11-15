import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react'
import { ScrollView, View } from 'react-native'
import {
  type RouteProp,
  useNavigation,
  useRoute,
} from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import Header from '@/components/ui/layout/Header'
import Wrapper from '@/components/ui/layout/Wrapper'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'
import { analytics } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import type { RootStackParamList } from '@/types/rootStack'
import BuddySettingsScopeBar from '@/features/buddies/components/BuddySettingsScopeBar'
import BuddySettingsUndoButton from '@/features/buddies/components/BuddySettingsUndoButton'
import {
  BuddySettingsScope,
  recordBuddySettingsUndo,
  useBuddySettingsUndos,
} from '@/features/buddies/hooks/useBuddySettingsScope'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import type { Buddy } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

function resetBuddySettings(buddy: Buddy) {
  const { inboxId: id, overrides } = buddy
  const alerts = useBuddies.getState().alertOverrides[id]
  analytics.capture('buddies_setting_reset', { setting: 'all', scope: 'buddy' })
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

type ScreenName = 'Buddies Settings' | 'Buddies Sharing'

export default function BuddySettingsScreenFrame({
  title,
  children,
  footer,
}: {
  title: string
  children: (buddy: Buddy | null) => ReactNode
  footer?: (buddy: Buddy | null) => ReactNode
}) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, ScreenName>>()
  const inboxId =
    useRoute<RouteProp<RootStackParamList, ScreenName>>().params?.inboxId ??
    null
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

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false })
  }, [inboxId])

  useEffect(() => {
    const below = useBuddySettingsUndos.getState().undos
    useBuddySettingsUndos.setState({ undos: [] })
    return () => useBuddySettingsUndos.setState({ undos: below })
  }, [])

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <Header
          buttonType='back'
          title={title}
          rightElement={
            <View style={{ position: 'absolute', right: 0 }}>
              <BuddySettingsUndoButton
                onUndone={(where) =>
                  navigation.setParams({ inboxId: where ?? undefined })
                }
              />
            </View>
          }
        />
      ),
    })
  }, [navigation, title])

  const foldColumn = useFoldColumn(720)
  return (
    <Wrapper insets='bottom' style={{ flex: 1 }}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={[
          {
            gap: 24,
            paddingVertical: 20,
            paddingHorizontal: 15,
            width: '100%',
            maxWidth: 720,
            alignSelf: 'center',
          },
          foldColumn,
        ]}
      >
        <BuddySettingsScopeBar
          buddy={buddy}
          onSelect={select}
          onResetAll={() => buddy && resetBuddySettings(buddy)}
        />
        <BuddySettingsScope
          buddy={buddy}
          record={recordBuddySettingsUndo}
          select={select}
        >
          {children(buddy)}
        </BuddySettingsScope>
        {footer?.(buddy)}
      </ScrollView>
    </Wrapper>
  )
}
