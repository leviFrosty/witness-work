import { useEffect } from 'react'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RootStackParamList } from '@/types/rootStack'
import BuddyAppearanceSection from '@/features/buddies/components/BuddyAppearanceSection'
import BuddyBadgesSection from '@/features/buddies/components/BuddyBadgesSection'
import BuddyDetailActions from '@/features/buddies/components/BuddyDetailActions'
import BuddyNeedsAnswerSection from '@/features/buddies/components/BuddyNeedsAnswerSection'
import BuddyProfileHeader from '@/features/buddies/components/BuddyProfileHeader'
import BuddySettingsLink from '@/features/buddies/components/BuddySettingsLink'
import BuddyTogetherSection from '@/features/buddies/components/BuddyTogetherSection'
import BuddyTwoWeekStrip from '@/features/buddies/components/BuddyTwoWeekStrip'
import useBuddyTogether from '@/features/buddies/hooks/useBuddyTogether'
import { confirmRemoveBuddy } from '@/features/buddies/lib/buddyConfirmations'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

type Props = NativeStackScreenProps<RootStackParamList, 'Buddy'>

export default function BuddyDetailScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const { inboxId } = route.params
  const buddy = useBuddies((state) =>
    state.buddies.find((candidate) => candidate.inboxId === inboxId)
  )
  const card = useBuddies((state) => state.cards[inboxId])
  const { needsAnswer, together } = useBuddyTogether(inboxId)
  const foldColumn = useFoldColumn(720)

  useEffect(() => {
    if (buddy) return
    if (navigation.canGoBack()) navigation.goBack()
    else navigation.replace('Buddies')
  }, [buddy, navigation])
  if (!buddy) return null

  const name = buddyDisplayName(buddy)

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
        <BuddyProfileHeader buddy={buddy} />
        <BuddyAppearanceSection buddy={buddy} />
        <BuddyBadgesSection buddy={buddy} />
        <BuddyDetailActions inboxId={inboxId} />
        <BuddyNeedsAnswerSection items={needsAnswer} />
        <BuddyTogetherSection items={together} buddyName={name} />
        <BuddyTwoWeekStrip buddy={buddy} card={card} />
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
