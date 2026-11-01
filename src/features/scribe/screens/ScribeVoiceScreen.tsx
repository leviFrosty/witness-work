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
