import { useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Alert,
  Modal,
  View,
  useWindowDimensions,
} from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { ZoomIn } from 'react-native-reanimated'
import {
  CircleAlert as CircleAlertIcon,
  Check as CheckIcon,
  Keyboard as KeyboardIcon,
  Mic as MicIcon,
  MicOff as MicOffIcon,
  X as XIcon,
} from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import InfoPopover from '@/components/ui/InfoPopover'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import { analytics } from '@/lib/analytics'
import Haptics from '@/lib/haptics'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'
import {
  SCRIBE_VOICE_DISCARD_CONFIRM_MS,
  useScribeHasFinishedTurn,
  useScribeVoiceCapture,
  type ScribeVoiceErrorCode,
} from '@/features/scribe'
import { isDarkTheme } from '@/features/scribe/shaders/orbPalette'
import ScribeOrb from '@/features/scribe/components/ScribeOrb'
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

type Cue = 'listening' | 'countdown'

const CONTROL_ROOM = 88

const MIN_LOADING_MS = 700

const LOADING_TICK_MS = 140
const LOADING_TICKS_MAX = 24

const MINI_BOX = 64
const MINI_CANVAS = 104
const MINI_IN = ZoomIn.duration(220)

interface Props {
  onSend: (text: string) => void

  onType: (draftText?: string) => void

  onClose: () => void

  minimized?: boolean
  onMinimizedChange?: (minimized: boolean) => void
}

const ScribeVoiceSheet = ({
  onSend,
  onType,
  onClose,
  minimized = false,
  onMinimizedChange,
}: Props) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { height: windowHeight } = useWindowDimensions()
  const largeText = useAccessibilityTextSize()
  const hasFinishedTurn = useScribeHasFinishedTurn()
  const [example] = useState(pickVoiceExample)
  const [nothingHeard, setNothingHeard] = useState(false)

  const leaving = useRef(false)
  const started = useRef(false)
  const announced = useRef<Cue | null>(null)
  const minimizedOnce = useRef(false)
  const inline = onMinimizedChange !== undefined

  const send = (text: string) => {
    leaving.current = true
    onSend(text)
  }
  const typeInstead = (draftText?: string) => {
    leaving.current = true
    onType(draftText)
  }

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

      if (reason === 'interrupted') {
        typeInstead(said)
        return
      }
      send(said)
    },
  })
  const { state } = capture

  useEffect(() => {
    if (started.current) return
    started.current = true
    void capture.start()
  }, [capture])

  useEffect(() => {
    if (state === 'error') void Haptics.error()
  }, [state])

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
    onClose()
  }

  const requestDiscard = (then?: () => void) => {
    const discard = () => {
      close()
      then?.()
    }
    if (!recording || capture.elapsedMs < SCRIBE_VOICE_DISCARD_CONFIRM_MS) {
      discard()
      return
    }
    Alert.alert(i18n.t('scribe_voiceDiscardTitle'), undefined, [
      { text: i18n.t('scribe_voiceKeepRecording'), style: 'cancel' },
      {
        text: i18n.t('scribe_voiceDiscard'),
        style: 'destructive',
        onPress: discard,
      },
    ])
  }

  const onBeforeRemove = useEffectEvent((proceed: () => void) =>
    requestDiscard(inline ? proceed : undefined)
  )
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (leaving.current) return
        event.preventDefault()
        onBeforeRemove(() => navigation.dispatch(event.data.action))
      }),
    [navigation]
  )

  const listening = state === 'listening'
  const canMinimize = inline && listening && capture.remainingMs === null
  const showMini =
    minimized &&
    !nothingHeard &&
    (canMinimize || (inline && state === 'finishing'))
  useEffect(() => {
    if (minimized && !showMini) onMinimizedChange?.(false)
  }, [minimized, showMini, onMinimizedChange])

  const minimize = () => {
    if (!minimizedOnce.current) {
      minimizedOnce.current = true
      analytics.capture('scribe_voice_minimized')
    }
    onMinimizedChange?.(true)
  }

  const done = () => {
    void Haptics.light()
    capture.done()
  }
  const retry = () => {
    setNothingHeard(false)
    announced.current = null
    void capture.start()
  }

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

  const sheet = (
    <ScribeSheetFrame
      height={largeText ? windowHeight : Math.min(640, windowHeight * 0.74)}
      onDismissRequest={() => requestDiscard()}
      onMinimizeRequest={canMinimize ? minimize : undefined}
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
              onPress={() => requestDiscard()}
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

  if (!inline) return sheet

  return (
    <>
      <Modal
        visible={!showMini}
        transparent
        animationType='none'
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => (canMinimize ? minimize() : requestDiscard())}
      >
        {}
        <GestureHandlerRootView style={{ flex: 1 }}>
          {sheet}
        </GestureHandlerRootView>
      </Modal>
      {showMini ? (
        <Animated.View
          entering={MINI_IN}
          pointerEvents='box-none'
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 4,
            alignItems: 'center',
          }}
        >
          <PointerTooltip label={i18n.t('scribe_voiceListening')} effect='none'>
            <Button
              noTransform
              pointerEffect='lift'
              onPress={() => onMinimizedChange(false)}
              accessibilityRole='button'
              accessibilityLabel={i18n.t('scribe_voiceMiniOrb')}
              style={{
                width: MINI_BOX,
                height: MINI_BOX,
                borderRadius: MINI_BOX / 2,
              }}
            >
              <ScribeOrb
                size={MINI_CANVAS}
                core={0.27}
                state={listening ? 'listening' : 'organizing'}
                level={capture.level}
                style={{
                  position: 'absolute',
                  left: (MINI_BOX - MINI_CANVAS) / 2,
                  top: (MINI_BOX - MINI_CANVAS) / 2,
                }}
              />
            </Button>
          </PointerTooltip>
        </Animated.View>
      ) : null}
    </>
  )
}

export default ScribeVoiceSheet
