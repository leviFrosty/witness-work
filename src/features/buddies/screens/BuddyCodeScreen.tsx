import { useState } from 'react'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import SegmentedControl from '@/components/ui/SegmentedControl'
import Wrapper from '@/components/ui/layout/Wrapper'
import i18n from '@/lib/locales'
import { RootStackParamList } from '@/types/rootStack'
import BuddyCodePanel from '@/features/buddies/components/BuddyCodePanel'
import BuddyScanPanel from '@/features/buddies/components/BuddyScanPanel'

type Props = NativeStackScreenProps<RootStackParamList, 'Buddy Code'>
type Mode = RootStackParamList['Buddy Code']['mode']

/** In-person pairing: show my single-use code, or scan theirs. */
export default function BuddyCodeScreen({ route, navigation }: Props) {
  const [mode, setMode] = useState<Mode>(route.params.mode)

  return (
    <Wrapper insets='bottom' style={{ flex: 1 }}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ gap: 24, padding: 20, paddingBottom: 40 }}
      >
        <SegmentedControl<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { key: 'code', label: i18n.t('buddies_myCode') },
            { key: 'scan', label: i18n.t('buddies_scan') },
          ]}
        />
        {mode === 'code' ? (
          <BuddyCodePanel
            inviteId={route.params.inviteId}
            onClosed={() => navigation.goBack()}
          />
        ) : (
          <BuddyScanPanel
            onInvite={(link) => navigation.replace('Buddy Invite', { link })}
          />
        )}
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}
