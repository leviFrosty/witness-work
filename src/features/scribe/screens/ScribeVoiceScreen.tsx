import { useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Alert,
  View,
  useWindowDimensions,
} from 'react-native'
import {
  CircleAlert as CircleAlertIcon,
  Check as CheckIcon,
  Keyboard as KeyboardIcon,
  Mic as MicIcon,
  MicOff as MicOffIcon,
  X as XIcon,
} from 'lucide-react-native'
import * as Crypto from 'expo-crypto'
import {
  type RouteProp,
  useNavigation,
  useRoute,
} from '@react-navigation/native'
import IconButton from '@/components/ui/IconButton'
import InfoPopover from '@/components/ui/InfoPopover'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import Haptics from '@/lib/haptics'
import i18n, { type TranslationKey } from '@/lib/locales'
import type {
  RootStackNavigation,
  RootStackParamList,
  ScribeConversationRouteParams,
} from '@/types/rootStack'
import {
  SCRIBE_VOICE_DISCARD_CONFIRM_MS,
  useScribeHasFinishedTurn,
  useScribeVoiceCapture,
  type ScribeVoiceErrorCode,
} from '@/features/scribe'
import { isDarkTheme } from '@/features/scribe/shaders/orbPalette'
import ScribeSheetFrame from '@/features/scribe/components/ScribeSheetFrame'
import { ScribePill } from '@/features/scribe/components/ScribeBadge'
import ScribeVoiceMessage from '@/features/scribe/components/ScribeVoiceMessage'
import ScribeVoiceStage, {
  pickVoiceExample,
} from '@/features/scribe/components/ScribeVoiceStage'
import {
  Elapsed,
  RoundButton,
} from '@/features/scribe/components/ScribeVoiceControls'

const VOICE_ERROR_COPY: Record<ScribeVoiceErrorCode, TranslationKey> = {
  model_unavailable: 'scribe_voiceModelUnavailable',
  unsupported: 'scribe_voiceModelUnavailable',
  audio_unavailable: 'scribe_voiceAudioUnavailable',
  busy: 'scribe_voiceAudioUnavailable',
  failed: 'scribe_voiceFailed',
}

/** What screen readers hear as listening changes; never the level. */
type Cue = 'listening' | 'countdown'

/** Done (76) and its halo: Discard centers in the same room so labels align. */
const CONTROL_ROOM = 88
/**
 * The spinner turns at least this long, so a warm start still reads as loading
 * and snaps to ready after the sheet has risen.
 */
const MIN_LOADING_MS = 700
// Soft ticks while loading; capped so a slow start doesn't buzz on.
const LOADING_TICK_MS = 140
const LOADING_TICKS_MAX = 24

/**
 * Speak an update (V-A): a sheet over the screen it opened from, with the orb
 * that follows the User's voice, Discard and Done. No live transcript; the text
 * goes to the conversation, which shows what Scribe AI understood. Type instead
 * (and an interruption) leaves what was heard in the composer, unsent.
 */
const ScribeVoiceScreen = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { params } = useRoute<RouteProp<RootStackParamList, 'ScribeVoice'>>()
  const { height: windowHeight } = useWindowDimensions()
  const largeText = useAccessibilityTextSize()
  const hasFinishedTurn = useScribeHasFinishedTurn()
  const [example] = useState(pickVoiceExample)
  const [nothingHeard, setNothingHeard] = useState(false)
  // Set before this screen closes itself, so `beforeRemove` lets it go.
  const leaving = useRef(false)
  const started = useRef(false)
  const announced = useRef<Cue | null>(null)

  const openConversation = (
    extra: Partial<ScribeConversationRouteParams> = {}
  ) => {
    leaving.current = true
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
  const typeInstead = (draftText?: string) =>
    openConversation(
      draftText ? { focusComposer: true, draftText } : { focusComposer: true }
    )

  const capture = useScribeVoiceCapture({
    minPreparingMs: MIN_LOADING_MS,
    onFinished: (text, reason) => {
      const said = text.trim()
      if (reason === 'typed') {
        typeInstead(said)
        return
      }
      if (!said) {
        setNothingHeard(true)
        return
      }
      // A call or leaving the app cut the User off: keep what was heard to
      // finish, rather than sending half a thought.
      if (reason === 'interrupted') {
        typeInstead(said)
        return
      }
      openConversation({
        initialText: said,
        inputSource: 'voice',
        submitId: Crypto.randomUUID(),
      })
    },
  })
  const { state } = capture

  useEffect(() => {
    if (started.current) return
    started.current = true
    void capture.start()
  }, [capture])

  // The capture snaps when the mic goes live.
  useEffect(() => {
    if (state === 'error') void Haptics.error()
  }, [state])

  // A soft pulse while getting ready, which the snap ends. Not while a
  // language downloads: that can take minutes.
  const pulsing = state === 'preparing' && capture.preparingPercent === null
  useEffect(() => {
    if (!pulsing) return
    let ticks = 0
    const timer = setInterval(() => {
      if (++ticks > LOADING_TICKS_MAX) clearInterval(timer)
      else void Haptics.soft()
    }, LOADING_TICK_MS)
    return () => clearInterval(timer)
  }, [pulsing])

  // The sheet's text changes silently for VoiceOver, and a live region would
  // read every second of the countdown, so announce the two moments that
  // matter once each. Not the pause hint: it would speak into the open mic.
  const cue: Cue | null =
    state !== 'listening'
      ? null
      : capture.remainingMs !== null
        ? 'countdown'
        : 'listening'
  useEffect(() => {
    if (cue === null || announced.current === cue) return
    if (cue === 'listening' && announced.current !== null) return
    announced.current = cue
    AccessibilityInfo.announceForAccessibility(
      cue === 'listening'
        ? i18n.t('scribe_voiceListening')
        : i18n.t('scribe_voiceTimeLeft', {
            seconds: Math.ceil((capture.remainingMs ?? 0) / 1000),
          })
    )
  }, [cue, capture.remainingMs])

  const recording = state === 'listening' || state === 'finishing'
  const close = () => {
    leaving.current = true
    capture.discard()
    navigation.goBack()
  }
  // Short recordings go at once; longer ones ask first.
  const requestDiscard = () => {
    if (!recording || capture.elapsedMs < SCRIBE_VOICE_DISCARD_CONFIRM_MS) {
      close()
      return
    }
    Alert.alert(i18n.t('scribe_voiceDiscardTitle'), undefined, [
      { text: i18n.t('scribe_voiceKeepRecording'), style: 'cancel' },
      {
        text: i18n.t('scribe_voiceDiscard'),
        style: 'destructive',
        onPress: close,
      },
    ])
  }

  // Android Back and other ways out follow the same rule as Discard.
  const onBeforeRemove = useEffectEvent(requestDiscard)
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (leaving.current) return
        event.preventDefault()
        onBeforeRemove()
      }),
    [navigation]
  )

  const done = () => {
    void Haptics.light()
    capture.done()
  }
  const retry = () => {
    setNothingHeard(false)
    announced.current = null
    void capture.start()
  }
  // While listening, what was heard so far goes along; before that, nothing
  // was (the recording is discarded as the sheet closes).
  const switchToKeyboard = () => {
    if (state === 'listening') capture.switchToKeyboard()
    else typeInstead()
  }

  const message = (() => {
    if (nothingHeard)
      return (
        <ScribeVoiceMessage
          icon={MicIcon}
          body={i18n.t('scribe_voiceNothingHeard')}
          primary={{ label: i18n.t('scribe_voiceTryAgain'), onPress: retry }}
          secondary={{
            label: i18n.t('scribe_voiceTypeInstead'),
            onPress: () => typeInstead(),
          }}
        />
      )
    switch (state) {
      case 'priming':
        return (
          <ScribeVoiceMessage
            icon={MicIcon}
            title={i18n.t('scribe_voicePrimingTitle')}
            body={i18n.t('scribe_voicePrimingBody')}
            primary={{
              label: i18n.t('scribe_voiceContinue'),
              onPress: () => void capture.confirmPermission(),
            }}
            secondary={{
              label: i18n.t('scribe_voiceTypeInstead'),
              onPress: () => typeInstead(),
            }}
          />
        )
      case 'denied':
        return (
          <ScribeVoiceMessage
            icon={MicOffIcon}
            tone='warn'
            body={i18n.t('scribe_voiceDeniedBody')}
            primary={{
              label: i18n.t('scribe_voiceOpenSettings'),
              onPress: capture.openSettings,
            }}
            secondary={{
              label: i18n.t('scribe_voiceTypeInstead'),
              onPress: () => typeInstead(),
            }}
          />
        )
      case 'error': {
        const code = capture.error ?? 'failed'
        const noVoice = code === 'model_unavailable' || code === 'unsupported'
        return (
          <ScribeVoiceMessage
            icon={noVoice ? MicOffIcon : CircleAlertIcon}
            tone='warn'
            body={i18n.t(VOICE_ERROR_COPY[code])}
            primary={
              noVoice
                ? {
                    label: i18n.t('scribe_voiceTypeInstead'),
                    onPress: () => typeInstead(),
                  }
                : { label: i18n.t('scribe_voiceTryAgain'), onPress: retry }
            }
            secondary={
              noVoice
                ? undefined
                : {
                    label: i18n.t('scribe_voiceTypeInstead'),
                    onPress: () => typeInstead(),
                  }
            }
          />
        )
      }
      default:
        return null
    }
  })()

  const listening = state === 'listening'
  const title = listening
    ? i18n.t(capture.quiet ? 'scribe_voicePauseHint' : 'scribe_voiceListening')
    : state === 'finishing'
      ? null
      : capture.preparingPercent !== null
        ? i18n.t('scribe_voiceDownloading', {
            percent: Math.round(capture.preparingPercent),
          })
        : i18n.t('scribe_voicePreparing')
  const subtitle = !listening
    ? null
    : capture.remainingMs !== null
      ? i18n.t('scribe_voiceTimeLeft', {
          seconds: Math.ceil(capture.remainingMs / 1000),
        })
      : capture.quiet
        ? i18n.t('scribe_voiceStillListening')
        : hasFinishedTurn
          ? null
          : example
  const raised = isDarkTheme(theme)
    ? theme.colors.card
    : theme.colors.background
  const canType = message === null && state !== 'finishing'

  return (
    <ScribeSheetFrame
      // Large text gets the whole window (the frame caps it under the top).
      height={largeText ? windowHeight : Math.min(640, windowHeight * 0.74)}
      onDismissRequest={requestDiscard}
    >
      <View
        style={{
          height: 48,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ width: 44, alignItems: 'center' }}>
          {canType ? (
            <PointerTooltip
              label={i18n.t('scribe_voiceTypeInstead')}
              effect='none'
            >
              <IconButton
                icon={KeyboardIcon}
                size={22}
                color={theme.colors.textAlt}
                onPress={switchToKeyboard}
                accessibilityLabel={i18n.t('scribe_voiceTypeInstead')}
                frame
              />
            </PointerTooltip>
          ) : null}
        </View>
        <ScribePill />
        <InfoPopover
          centered
          title={i18n.t('scribe_whatCanISayTitle')}
          description={i18n.t('scribe_whatCanISayBody')}
        />
      </View>
      {message ?? (
        <>
          <ScribeVoiceStage
            orb={
              listening
                ? 'listening'
                : state === 'finishing'
                  ? 'organizing'
                  : 'loading'
            }
            level={capture.level}
            orbLabel={title ?? i18n.t('scribe_voiceListening')}
            title={title}
            subtitle={subtitle}
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 30,
              paddingTop: 8,
              paddingBottom: 10,
            }}
          >
            <RoundButton
              size={60}
              room={CONTROL_ROOM}
              icon={XIcon}
              background={raised}
              foreground={theme.colors.text}
              label={i18n.t('scribe_voiceDiscard')}
              onPress={requestDiscard}
            />
            <View style={{ marginBottom: 24, minWidth: 60 }}>
              {recording ? <Elapsed ms={capture.elapsedMs} /> : null}
            </View>
            <RoundButton
              size={76}
              room={CONTROL_ROOM}
              icon={CheckIcon}
              iconSize={34}
              background={theme.colors.accent}
              foreground={theme.colors.textInverse}
              label={i18n.t('scribe_voiceDone')}
              labelColor={theme.colors.text}
              halo={theme.colors.accent}
              showHalo={listening && capture.quiet}
              disabled={!listening}
              onPress={done}
            />
          </View>
        </>
      )}
    </ScribeSheetFrame>
  )
}

export default ScribeVoiceScreen
