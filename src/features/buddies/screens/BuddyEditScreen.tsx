import { useEffect } from 'react'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RootStackParamList } from '@/types/rootStack'
import BuddyAppearanceSection from '@/features/buddies/components/BuddyAppearanceSection'
import BuddySettingsLink from '@/features/buddies/components/BuddySettingsLink'
import { confirmRemoveBuddy } from '@/features/buddies/lib/buddyConfirmations'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

type Props = NativeStackScreenProps<RootStackParamList, 'BuddyEdit'>

export default function BuddyEditScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const { inboxId } = route.params
  const buddy = useBuddies((state) =>
    state.buddies.find((candidate) => candidate.inboxId === inboxId)
  )
  const foldColumn = useFoldColumn(720)

  useEffect(() => {
    if (buddy) return
    if (navigation.canGoBack()) navigation.goBack()
    else navigation.replace('Buddies')
  }, [buddy, navigation])
  if (!buddy) return null

  return (
    <Wrapper insets='bottom' style={{ flex: 1 }}>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps='handled'
        enableResetScrollToCoords={false}
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
        <BuddyAppearanceSection buddy={buddy} />
        <BuddySettingsLink buddy={buddy} />
        <Button
          onPress={() => confirmRemoveBuddy(buddy)}
          style={{ alignSelf: 'center' }}
        >
          <Text style={{ color: theme.colors.error }}>
            {i18n.t('buddies_removeBuddy')}
          </Text>
        </Button>
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}
