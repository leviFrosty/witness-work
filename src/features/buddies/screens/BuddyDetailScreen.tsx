import { useEffect, type ReactNode } from 'react'
import { ScrollView } from 'react-native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import Wrapper from '@/components/ui/layout/Wrapper'
import { RootStackParamList } from '@/types/rootStack'
import BuddyBadgesSection from '@/features/buddies/components/BuddyBadgesSection'
import BuddyDetailActions from '@/features/buddies/components/BuddyDetailActions'
import BuddyNeedsAnswerSection from '@/features/buddies/components/BuddyNeedsAnswerSection'
import BuddyProfileHeader from '@/features/buddies/components/BuddyProfileHeader'
import BuddyReconnectCard from '@/features/buddies/components/BuddyReconnectCard'
import BuddyTogetherSection from '@/features/buddies/components/BuddyTogetherSection'
import BuddyTwoWeekStrip from '@/features/buddies/components/BuddyTwoWeekStrip'
import useBuddyTogether from '@/features/buddies/hooks/useBuddyTogether'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import type { Buddy } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

type Props = NativeStackScreenProps<RootStackParamList, 'Buddy'> & {
  renderPetRoom?: (buddy: Buddy) => ReactNode
}

export default function BuddyDetailScreen({
  route,
  navigation,
  renderPetRoom,
}: Props) {
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

  return (
    <Wrapper insets='bottom' style={{ flex: 1 }}>
      <ScrollView
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
        <BuddyReconnectCard from={inboxId} />
        {renderPetRoom?.(buddy)}
        <BuddyBadgesSection buddy={buddy} />
        <BuddyDetailActions inboxId={inboxId} />
        <BuddyNeedsAnswerSection items={needsAnswer} />
        <BuddyTogetherSection
          items={together}
          buddyName={buddyDisplayName(buddy)}
        />
        <BuddyTwoWeekStrip buddy={buddy} card={card} />
      </ScrollView>
    </Wrapper>
  )
}
