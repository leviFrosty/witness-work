import * as Crypto from 'expo-crypto'
import {
  type RouteProp,
  useNavigation,
  useRoute,
} from '@react-navigation/native'
import type {
  RootStackNavigation,
  RootStackParamList,
  ScribeConversationRouteParams,
} from '@/types/rootStack'
import ScribeVoiceSheet from '@/features/scribe/components/ScribeVoiceSheet'

/**
 * Speak an update from outside a conversation (Home's orb, the + sheet): the
 * voice sheet over the screen it opened from, then the conversation. A
 * conversation draws the sheet itself, so it can minimize while listening.
 */
const ScribeVoiceScreen = () => {
  const navigation = useNavigation<RootStackNavigation>()
  const { params } = useRoute<RouteProp<RootStackParamList, 'ScribeVoice'>>()

  const openConversation = (
    extra: Partial<ScribeConversationRouteParams> = {}
  ) => {
    const target: ScribeConversationRouteParams = {
      entry: params.entry,
      conversationId: params.conversationId,
      ...extra,
    }
    // Opened from a conversation (its microphone, Say a change), even one with
    // no message yet: back to it. From anywhere else, a new one.
    const fromConversation =
      params.conversationId !== undefined ||
      params.entry === 'conversation' ||
      params.entry === 'say_a_change'
    if (fromConversation) navigation.popTo('ScribeConversation', target)
    else navigation.replace('ScribeConversation', target)
  }

  return (
    <ScribeVoiceSheet
      onSend={(text) =>
        openConversation({
          initialText: text,
          inputSource: 'voice',
          submitId: Crypto.randomUUID(),
        })
      }
      onType={(draftText) =>
        openConversation(
          draftText
            ? { focusComposer: true, draftText }
            : { focusComposer: true }
        )
      }
      onClose={() => navigation.goBack()}
    />
  )
}

export default ScribeVoiceScreen
