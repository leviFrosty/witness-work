import { useEffect, useRef, useState } from 'react'
import { Keyboard, Platform, type TextInput, View } from 'react-native'
import Animated, {
  KeyboardState,
  useAnimatedKeyboard,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  type RouteProp,
  useNavigation,
  useRoute,
} from '@react-navigation/native'
import Wrapper from '@/components/ui/layout/Wrapper'
import { analytics } from '@/lib/analytics'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import {
  forgoScribeResume,
  useScribeAvailability,
  useScribeConversation,
  useScribePaperCapture,
  useScribePhotoCapture,
  useScribeUsage,
  useScribeVoiceAvailability,
  type ScribeInputSource,
} from '@/features/scribe'
import ScribeConversationHeader from '@/features/scribe/components/ScribeConversationHeader'
import ScribeConversationFooter from '@/features/scribe/components/ScribeConversationFooter'
import ScribeComposer from '@/features/scribe/components/ScribeComposer'
import ScribeTimeline from '@/features/scribe/components/ScribeTimeline'
import ScribeVoiceSheet from '@/features/scribe/components/ScribeVoiceSheet'
import type { RenderSupporterCta } from '@/features/scribe/components/ScribeStateCards'

/** `submitId`s already sent, so a remount can't send a recording twice. */
const sentSubmitIds = new Set<string>()

interface Props {
  /** Supporter's upgrade button, from the app tier. */
  renderSupporterCta?: RenderSupporterCta
}

const Conversation = ({
  renderSupporterCta,
  onNewConversation,
  onAdopt,
}: Props & {
  onNewConversation: () => void
  /** The first message started this conversation; the route takes its id. */
  onAdopt: (conversationId: string) => void
}) => {
  const navigation = useNavigation<RootStackNavigation>()
  const { params } =
    useRoute<RouteProp<RootStackParamList, 'ScribeConversation'>>()
  const controller = useScribeConversation(params.conversationId ?? null)
  const availability = useScribeAvailability()
  const voiceAvailability = useScribeVoiceAvailability()
  const { usage } = useScribeUsage()
  const photo = useScribePhotoCapture()
  const paper = useScribePaperCapture()
  const [draft, setDraft] = useState('')
  const [draftSource, setDraftSource] = useState<ScribeInputSource>('keyboard')
  // The voice sheet, drawn over this conversation so it can shrink to a small
  // orb while the User keeps talking.
  const [voice, setVoice] = useState<'conversation' | 'say_a_change' | null>(
    null
  )
  const [voiceMinimized, setVoiceMinimized] = useState(false)
  const inputRef = useRef<TextInput>(null)
  const { conversationId, run } = controller
  const running = run.phase === 'sending' || run.phase === 'thinking'

  // Once the first message starts the conversation, the route names it, so
  // Say a change and History come back to it.
  useEffect(() => {
    if (conversationId && conversationId !== params.conversationId)
      onAdopt(conversationId)
  }, [conversationId, params.conversationId, onAdopt])

  // A recording (or onboarding's text) arrives once per submitId.
  const { initialText, submitId } = params
  useEffect(() => {
    if (!initialText || !submitId || sentSubmitIds.has(submitId)) return
    sentSubmitIds.add(submitId)
    navigation.setParams({ initialText: undefined, submitId: undefined })
    void controller.send({
      text: initialText,
      source: params.inputSource ?? 'voice',
      entry: params.entry,
    })
  }, [initialText, submitId, params, navigation, controller])

  // Onboarding's Import from Paper reads the picked pages on open.
  const paperPages = params.paperPages
  const readPages = useRef<typeof paperPages>(undefined)
  useEffect(() => {
    if (!paperPages?.length || readPages.current === paperPages) return
    readPages.current = paperPages
    navigation.setParams({ paperPages: undefined })
    void paper.capture('pages', paperPages).then((text) => {
      if (!text) return
      setDraft(text)
      setDraftSource('paper')
      forgoScribeResume()
    })
  }, [paperPages, navigation, paper])

  // What a recording heard before Type instead or an interruption waits in
  // the composer, after anything already typed, for the User to finish.
  const draftText = params.draftText
  useEffect(() => {
    if (!draftText) return
    navigation.setParams({ draftText: undefined })
    setDraft((typed) =>
      typed.trim() ? `${typed.trim()} ${draftText}` : draftText
    )
    setDraftSource('voice')
    forgoScribeResume()
    // Back in a conversation that already had the keyboard: bring it back.
    const timer = setTimeout(() => inputRef.current?.focus(), 450)
    return () => clearTimeout(timer)
  }, [draftText, navigation])

  // Type instead, no on-device speech, onboarding: the keyboard, once the
  // push has settled (focusing mid-transition is dropped). Once per mount; the
  // param stays, since clearing it here would cancel the pending focus.
  const focusComposer = params.focusComposer
  useEffect(() => {
    if (!focusComposer) return
    let focused = false
    const focus = () => {
      if (focused) return
      focused = true
      inputRef.current?.focus()
    }
    const timer = setTimeout(focus, 450)
    const unsubscribe = navigation.addListener('transitionEnd', focus)
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [focusComposer, navigation])

  // Writing another message, or starting a new conversation, moves on from a
  // turn that stopped offline: it waits for Try again instead of going on by
  // itself when the connection comes back.
  const editDraft = (text: string) => {
    setDraft(text)
    forgoScribeResume()
  }
  const startNewConversation = () => {
    forgoScribeResume()
    onNewConversation()
  }

  const send = () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    setDraftSource('keyboard')
    paper.clearError()
    void controller.send({
      text,
      source: draftSource,
      entry: controller.items.length === 0 ? params.entry : 'conversation',
    })
  }

  // Say a change needs a message to go out: not at a limit or a full
  // conversation, and not while the composer is replaced.
  const canMessage =
    availability.status === 'available' &&
    !availability.limited &&
    controller.budget !== 'full' &&
    !(run.phase === 'error' && run.error.code === 'context_full')
  const voiceSupported = voiceAvailability !== 'unsupported'
  const listen = (entry: 'conversation' | 'say_a_change') => {
    // Already listening, minimized: open it again.
    if (voice) {
      setVoiceMinimized(false)
      return
    }
    Keyboard.dismiss()
    setVoiceMinimized(false)
    setVoice(entry)
  }
  const speak = () => {
    paper.clearError()
    listen('conversation')
  }
  const sayAChange = () => {
    if (!voiceSupported || availability.status !== 'available') {
      inputRef.current?.focus()
      return
    }
    listen('say_a_change')
  }
  const closeVoice = () => {
    setVoice(null)
    setVoiceMinimized(false)
  }
  const sendVoice = (text: string) => {
    const entry = voice ?? 'conversation'
    closeVoice()
    void controller.send({ text, source: 'voice', entry })
  }
  // What a recording heard waits in the composer, after anything typed.
  const typeVoice = (heard?: string) => {
    closeVoice()
    if (heard) {
      setDraft((typed) => (typed.trim() ? `${typed.trim()} ${heard}` : heard))
      setDraftSource('voice')
      forgoScribeResume()
    }
    setTimeout(() => inputRef.current?.focus(), 350)
  }
  const upgrade = () => {
    analytics.capture('scribe_upsell_tapped', { surface: 'limit_reached' })
    navigation.navigate('Paywall', {
      initialTier: 'supporter',
      source: 'scribe_limit_reached',
    })
  }

  return (
    <>
      <ScribeConversationHeader
        onHistory={() => navigation.navigate('ScribeHistory')}
        onNewConversation={conversationId ? startNewConversation : undefined}
      />
      <View style={{ flex: 1 }}>
        <ScribeTimeline
          controller={controller}
          onSayAChange={canMessage ? sayAChange : undefined}
        />
        {voice ? (
          <ScribeVoiceSheet
            onSend={sendVoice}
            onType={typeVoice}
            onClose={closeVoice}
            minimized={voiceMinimized}
            onMinimizedChange={setVoiceMinimized}
          />
        ) : null}
      </View>
      <ScribeConversationFooter
        controller={controller}
        availability={availability}
        usage={usage}
        onNewConversation={startNewConversation}
        onUpgrade={upgrade}
        renderSupporterCta={renderSupporterCta}
        composer={
          <ScribeComposer
            inputRef={inputRef}
            value={draft}
            onChangeText={editDraft}
            onSend={send}
            running={running}
            onStop={controller.stop}
            canSend={availability.status === 'available'}
            onSpeak={voiceSupported ? speak : undefined}
            photo={photo}
            paper={paper}
            onCaptured={(text, source) => {
              // Paper pages keep the blank line they have between each other.
              const gap = source === 'paper' ? '\n\n' : '\n'
              setDraft((current) =>
                current ? `${current}${gap}${text}` : text
              )
              setDraftSource(source)
              forgoScribeResume()
              inputRef.current?.focus()
            }}
          />
        }
      />
    </>
  )
}

/**
 * Scribe AI's conversation: what the User said or typed, Scribe AI's answers,
 * review cards for what it would add, and the composer (text, voice, scan,
 * paper pages). New conversation starts over on the same screen.
 */
const ScribeConversationScreen = ({ renderSupporterCta }: Props) => {
  const navigation = useNavigation<RootStackNavigation>()
  const { params } =
    useRoute<RouteProp<RootStackParamList, 'ScribeConversation'>>()
  const [session, setSession] = useState(0)
  const [adopted, setAdopted] = useState<string | null>(null)
  // The composer rides the keyboard's top edge as it animates.
  const keyboard = useAnimatedKeyboard()
  // Reanimated stops watching the keyboard while nothing subscribes, and on
  // Android a new subscriber gets the keyboard as it was when the last one
  // went away: still open if this screen closed with the keyboard up. Until
  // the keyboard moves there, its height counts only if it's really showing.
  // (iOS starts every subscriber closed, and may report only OPEN.)
  const trustKeyboard = useSharedValue(
    Platform.OS !== 'android' || Keyboard.isVisible()
  )
  useAnimatedReaction(
    () => keyboard.state.value,
    (state) => {
      if (state !== KeyboardState.OPEN && state !== KeyboardState.UNKNOWN)
        trustKeyboard.value = true
    }
  )
  const insets = useSafeAreaInsets()
  const keyboardPadding = useAnimatedStyle(() => ({
    paddingBottom: trustKeyboard.value
      ? Math.max(keyboard.height.value - insets.bottom, 0)
      : 0,
  }))

  const newConversation = () => {
    navigation.setParams({
      conversationId: undefined,
      initialText: undefined,
      submitId: undefined,
      inputSource: undefined,
      draftText: undefined,
      paperPages: undefined,
      entry: 'conversation',
      focusComposer: true,
    })
    setSession((n) => n + 1)
  }
  const adopt = (conversationId: string) => {
    setAdopted(conversationId)
    navigation.setParams({ conversationId })
  }
  // A conversation picked in History (or opened by id) mounts fresh; one this
  // screen started keeps its state.
  const shown =
    !params.conversationId || params.conversationId === adopted
      ? 'own'
      : params.conversationId

  return (
    <Wrapper insets='bottom' style={{ flex: 1 }}>
      <Animated.View style={[{ flex: 1 }, keyboardPadding]}>
        <Conversation
          key={`${session}:${shown}`}
          renderSupporterCta={renderSupporterCta}
          onNewConversation={newConversation}
          onAdopt={adopt}
        />
      </Animated.View>
    </Wrapper>
  )
}

export default ScribeConversationScreen
