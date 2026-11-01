import { useEffect, useRef, useState } from 'react'
import { AppState, Linking } from 'react-native'
import { useSharedValue } from 'react-native-reanimated'
import type { EventSubscription } from 'expo-modules-core'
import * as Speech from '../../../../modules/speech-transcription'
import useContacts from '@/stores/contactsStore'
import Haptics from '@/lib/haptics'
import { playCue, prepareCues } from '@/lib/audio'
import { logger } from '@/lib/logger'
import type {
  ScribeVoiceCapture,
  ScribeVoiceCaptureOptions,
  ScribeVoiceErrorCode,
  ScribeVoiceFinishReason,
  ScribeVoiceState,
} from '@/features/scribe/types'
import {
  SCRIBE_VOICE_COUNTDOWN_MS,
  SCRIBE_VOICE_MAX_MS,
  SCRIBE_VOICE_QUIET_MS,
} from '@/features/scribe/constants'
import { speechLocaleCandidates } from '@/features/scribe/lib/locale'
import {
  initialVoiceLevelRange,
  normalizeVoiceLevel,
  VOICE_SPEECH_LOUDNESS,
  type VoiceLevelRange,
} from '@/features/scribe/lib/voiceLevel'
import { trackCaptureFinished } from '@/features/scribe/analytics'

const MAX_CONTEXTUAL_NAMES = 100
const ELAPSED_TICK_MS = 250

const CUE_LEVEL_HOLD_MS = 500

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

function contactNames(): string[] {
  const names = new Set<string>()
  const { contacts } = useContacts.getState()
  for (
    let i = contacts.length - 1;
    i >= 0 && names.size < MAX_CONTEXTUAL_NAMES;
    i--
  ) {
    const name = contacts[i].name?.trim()
    if (name) names.add(name)
  }
  return [...names]
}

const voiceError = (code: Speech.SpeechErrorCode): ScribeVoiceErrorCode =>
  code === 'model_unavailable' ||
  code === 'audio_unavailable' ||
  code === 'busy' ||
  code === 'unsupported'
    ? code
    : 'failed'

export const voiceRemainingMs = (elapsedMs: number): number | null =>
  elapsedMs >= SCRIBE_VOICE_MAX_MS - SCRIBE_VOICE_COUNTDOWN_MS
    ? Math.max(0, SCRIBE_VOICE_MAX_MS - elapsedMs)
    : null

export function useScribeVoiceCapture(
  options: ScribeVoiceCaptureOptions
): ScribeVoiceCapture {
  const [state, setState] = useState<ScribeVoiceState>('idle')
  const [preparingPercent, setPreparingPercent] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [quiet, setQuiet] = useState(false)
  const [error, setError] = useState<ScribeVoiceErrorCode | null>(null)

  const level = useSharedValue(0)

  const stateRef = useRef<ScribeVoiceState>('idle')
  const subscriptions = useRef<EventSubscription[]>([])
  const startedAt = useRef<number | null>(null)
  const engine = useRef<string | null>(null)
  const range = useRef<VoiceLevelRange>(initialVoiceLevelRange())
  const heardSpeech = useRef(false)
  const lastSpeechAt = useRef(0)
  const quietRef = useRef(false)
  const holdLevelsUntil = useRef(0)
  const onFinished = useRef(options.onFinished)
  onFinished.current = options.onFinished

  const generation = useRef(0)

  const moveTo = (next: ScribeVoiceState) => {
    stateRef.current = next
    setState(next)
  }

  const markQuiet = (next: boolean) => {
    if (quietRef.current === next) return
    quietRef.current = next
    setQuiet(next)
  }

  const durationMs = () =>
    startedAt.current ? Date.now() - startedAt.current : undefined

  const teardown = (next: ScribeVoiceState = 'idle') => {
    generation.current++
    subscriptions.current.forEach((subscription) => subscription.remove())
    subscriptions.current = []
    level.value = 0
    range.current = initialVoiceLevelRange()
    heardSpeech.current = false
    startedAt.current = null
    engine.current = null
    markQuiet(false)
    setPreparingPercent(null)
    setElapsedMs(0)
    moveTo(next)
  }

  const finish = (text: string, reason: ScribeVoiceFinishReason) => {
    const final = text.trim()
    trackCaptureFinished({
      input: 'voice',
      outcome: final ? (reason === 'done' ? 'done' : reason) : 'empty',
      durationMs: durationMs(),
      engine: engine.current,
    })
    if (final && reason !== 'typed') void Haptics.success()
    teardown()
    onFinished.current(final, reason)
  }

  const fail = (code: Speech.SpeechErrorCode) => {
    logger.warn('[scribe] voice failed', code)
    trackCaptureFinished({
      input: 'voice',
      outcome: 'error',
      durationMs: durationMs(),
      errorCode: code,
      engine: engine.current,
    })
    if (code === 'permission_denied') {
      teardown('denied')
      return
    }
    setError(voiceError(code))
    teardown('error')
  }

  const onLevel = (raw: number) => {
    if (Date.now() < holdLevelsUntil.current) return
    const next = normalizeVoiceLevel(range.current, raw)
    range.current = { floor: next.floor, peak: next.peak }
    level.value = next.loudness
    const now = Date.now()
    if (next.loudness >= VOICE_SPEECH_LOUDNESS) {
      heardSpeech.current = true
      lastSpeechAt.current = now
      markQuiet(false)
    } else if (
      heardSpeech.current &&
      now - lastSpeechAt.current >= SCRIBE_VOICE_QUIET_MS
    ) {
      markQuiet(true)
    }
  }

  const begin = async () => {
    moveTo('preparing')
    const readyAt = Date.now() + (options.minPreparingMs ?? 0)
    void prepareCues('scribeVoiceStart', 'scribeVoiceEnd')
    try {
      subscriptions.current = [
        Speech.addListener('onLevel', ({ level: raw }) => {
          if (stateRef.current === 'listening') onLevel(raw)
        }),
        Speech.addListener('onPreparing', ({ progress }) => {
          setPreparingPercent(
            progress == null ? null : Math.round(progress * 100)
          )
        }),

        Speech.addListener('onEnd', ({ text }) => {
          if (stateRef.current === 'listening') finish(text, 'interrupted')
        }),
      ]
      const started = await Speech.start({
        localeCandidates: speechLocaleCandidates(),
        contextualStrings: contactNames(),
      })

      if (stateRef.current !== 'preparing') {
        void Speech.cancel()
        return
      }
      engine.current = started.engine
      const early = readyAt - Date.now()
      if (early > 0) {
        await wait(early)

        if (stateRef.current !== 'preparing') return
      }
      startedAt.current = Date.now()
      holdLevelsUntil.current = startedAt.current + CUE_LEVEL_HOLD_MS
      setPreparingPercent(null)
      moveTo('listening')

      void Haptics.rigid()
      playCue('scribeVoiceStart')
    } catch (thrown) {
      const code = Speech.speechErrorCode(thrown)
      if (code === 'cancelled' || stateRef.current === 'idle') return
      fail(code)
    }
  }

  const start = async () => {
    if (
      stateRef.current !== 'idle' &&
      stateRef.current !== 'error' &&
      stateRef.current !== 'denied'
    )
      return
    setError(null)
    if (!Speech.isSupported()) {
      setError('unsupported')
      moveTo('error')
      return
    }
    const at = generation.current
    try {
      const permissions = await Speech.getPermissions()
      if (generation.current !== at) return
      if (permissions.status === 'undetermined') {
        moveTo('priming')
        return
      }
      if (permissions.status !== 'granted') {
        moveTo('denied')
        return
      }
    } catch (thrown) {
      fail(Speech.speechErrorCode(thrown))
      return
    }
    await begin()
  }

  const confirmPermission = async () => {
    if (stateRef.current !== 'priming') return
    moveTo('requesting')
    const at = generation.current
    try {
      const permissions = await Speech.requestPermissions()

      if (generation.current !== at) return

      if (permissions.status === 'undetermined') {
        moveTo('priming')
        return
      }
      if (permissions.status !== 'granted') {
        moveTo('denied')
        return
      }
    } catch (thrown) {
      fail(Speech.speechErrorCode(thrown))
      return
    }
    await begin()
  }

  const stopWith = async (reason: ScribeVoiceFinishReason) => {
    if (stateRef.current !== 'listening') return
    moveTo('finishing')
    if (reason !== 'interrupted') playCue('scribeVoiceEnd')
    let text = ''
    try {
      text = await Speech.stop()
    } catch (thrown) {
      logger.warn(
        '[scribe] voice failed to stop',
        Speech.speechErrorCode(thrown)
      )
    }
    finish(text, reason)
  }

  const discard = () => {
    const current = stateRef.current
    if (current === 'idle') return
    if (current === 'listening') playCue('scribeVoiceEnd')
    void Speech.cancel()
    if (
      current === 'listening' ||
      current === 'preparing' ||
      current === 'finishing'
    )
      trackCaptureFinished({
        input: 'voice',
        outcome: 'discarded',
        durationMs: durationMs(),
        engine: engine.current,
      })
    setError(null)
    teardown()
  }

  const stopRef = useRef(stopWith)
  stopRef.current = stopWith
  const discardRef = useRef(discard)
  discardRef.current = discard

  useEffect(() => {
    if (state !== 'listening') return
    const tick = setInterval(() => {
      const began = startedAt.current
      if (!began) return
      const elapsed = Date.now() - began
      setElapsedMs(elapsed)
      if (elapsed >= SCRIBE_VOICE_MAX_MS) void stopRef.current('cap')
    }, ELAPSED_TICK_MS)
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'background') void stopRef.current('interrupted')
    })
    return () => {
      clearInterval(tick)
      appState.remove()
    }
  }, [state])

  useEffect(
    () => () => {
      generation.current++
      discardRef.current()
    },
    []
  )

  return {
    state,
    preparingPercent,
    level,
    elapsedMs,
    quiet,
    remainingMs: state === 'listening' ? voiceRemainingMs(elapsedMs) : null,
    error,
    start,
    confirmPermission,
    done: () => void stopWith('done'),
    switchToKeyboard: () => void stopWith('typed'),
    discard,
    openSettings: () => void Linking.openSettings(),
  }
}
