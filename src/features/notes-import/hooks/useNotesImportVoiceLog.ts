import { useEffect, useRef, useState } from 'react'
import { Alert, AppState, Linking } from 'react-native'
import { useSharedValue } from 'react-native-reanimated'
import type { EventSubscription } from 'expo-modules-core'
import * as Speech from '../../../../modules/speech-transcription'
import useContacts from '@/stores/contactsStore'
import { analytics } from '@/lib/analytics'
import Haptics from '@/lib/haptics'
import i18n, { _i18n } from '@/lib/locales'
import { logger } from '@/lib/logger'
import {
  toBcp47,
  VOICE_LOG_MAX_MS,
  voiceDurationBucket,
} from '@/features/notes-import/lib/notesImportCapture'

export type VoiceLogPhase =
  | 'idle'
  /** Checking permissions and starting the recognizer. */
  | 'starting'
  /** The OS is downloading Apple's speech model (first use per language). */
  | 'preparing'
  | 'recording'
  /** Waiting for the recognizer to finalize the last words. */
  | 'finishing'

type Outcome =
  | 'inserted'
  | 'empty'
  | 'cancelled'
  | 'failed'
  | 'permission_denied'

// Contact names bias recognition toward people the user actually visits. The
// list never leaves the device.
const MAX_CONTEXTUAL_NAMES = 100

const contactNames = (): string[] => {
  const names = new Set<string>()
  const contacts = useContacts.getState().contacts
  for (let i = contacts.length - 1; i >= 0; i--) {
    const name = contacts[i].name?.trim()
    if (name) names.add(name)
    if (names.size >= MAX_CONTEXTUAL_NAMES) break
  }
  return [...names]
}

const openSettingsAlert = (title: string, body: string) =>
  Alert.alert(title, body, [
    { text: i18n.t('cancel'), style: 'cancel' },
    {
      text: i18n.t('notesImport_openSettings'),
      onPress: () => void Linking.openSettings(),
    },
  ])

const errorAlert = (code: Speech.SpeechErrorCode) => {
  const body =
    code === 'unsupported'
      ? i18n.t('notesImport_voiceUnsupported')
      : code === 'model_unavailable'
        ? i18n.t('notesImport_voiceModelError')
        : code === 'audio_unavailable'
          ? i18n.t('notesImport_voiceAudioError')
          : i18n.t('notesImport_error')
  Alert.alert(i18n.t('notesImport_voiceErrorTitle'), body)
}

/**
 * Voice log capture (ADR 0018): records the microphone, transcribes on-device,
 * and hands the final transcript to `onTranscript` for the user to edit before
 * importing. Audio is never saved or sent; only the text the user later sends
 * leaves the device, through the normal Notes Import pipeline.
 */
export function useNotesImportVoiceLog({
  onTranscript,
}: {
  onTranscript: (text: string) => void
}) {
  const supported = Speech.isSupported()
  const [available, setAvailable] = useState(false)
  const [phase, setPhase] = useState<VoiceLogPhase>('idle')
  const [transcript, setTranscript] = useState('')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  // Drives the recording indicator on the UI thread; no re-render per sample.
  const level = useSharedValue(0)

  const phaseRef = useRef<VoiceLogPhase>('idle')
  const subscriptions = useRef<EventSubscription[]>([])
  const engineRef = useRef<Speech.SpeechEngine | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript

  const localeCandidates = () => [toBcp47(_i18n.locale)]

  // Hide the mic when no on-device recognizer serves the user's languages.
  useEffect(() => {
    if (!supported) return
    let cancelled = false
    Speech.getAvailability(localeCandidates())
      .then((result) => {
        if (!cancelled) setAvailable(result.available)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [supported])

  const moveTo = (next: VoiceLogPhase) => {
    phaseRef.current = next
    setPhase(next)
  }

  const report = (outcome: Outcome, errorCode?: Speech.SpeechErrorCode) => {
    const began = startedAtRef.current
    analytics.capture('notes_import_capture_finished', {
      method: 'voice',
      outcome,
      ...(errorCode ? { error_code: errorCode } : {}),
      ...(engineRef.current ? { engine: engineRef.current } : {}),
      ...(began ? { duration: voiceDurationBucket(Date.now() - began) } : {}),
    })
  }

  const teardown = () => {
    subscriptions.current.forEach((subscription) => subscription.remove())
    subscriptions.current = []
    level.value = 0
    startedAtRef.current = null
    engineRef.current = null
    setStartedAt(null)
    setDownloadProgress(null)
    setTranscript('')
    moveTo('idle')
  }

  const complete = (text: string) => {
    const final = text.trim()
    if (final) {
      report('inserted')
      void Haptics.success()
      onTranscriptRef.current(final)
    } else {
      report('empty')
      Alert.alert(
        i18n.t('notesImport_voiceEmptyTitle'),
        i18n.t('notesImport_voiceEmptyBody')
      )
    }
    teardown()
  }

  const start = async () => {
    if (!supported || phaseRef.current !== 'idle') return
    moveTo('starting')
    try {
      let permissions = await Speech.getPermissions()
      if (permissions.status === 'undetermined') {
        permissions = await Speech.requestPermissions()
      }
      if (permissions.status !== 'granted') {
        report('permission_denied')
        teardown()
        openSettingsAlert(
          i18n.t('notesImport_micDeniedTitle'),
          permissions.speechRecognition === 'notRequired'
            ? i18n.t('notesImport_micDeniedBody')
            : i18n.t('notesImport_micSpeechDeniedBody')
        )
        return
      }

      subscriptions.current = [
        Speech.addListener('onTranscript', ({ text }) => {
          if (phaseRef.current === 'recording') setTranscript(text)
        }),
        Speech.addListener('onLevel', (event) => {
          level.value = event.level
        }),
        Speech.addListener('onPreparing', ({ progress }) => {
          if (phaseRef.current === 'starting') moveTo('preparing')
          setDownloadProgress(progress ?? null)
        }),
        // A call or a route change ended recording; keep what was heard.
        Speech.addListener('onEnd', ({ text }) => {
          if (phaseRef.current === 'recording') complete(text)
        }),
      ]

      const { engine } = await Speech.start({
        localeCandidates: localeCandidates(),
        contextualStrings: contactNames(),
      })
      // Cancelled while the recognizer was still starting.
      if (phaseRef.current === 'idle') {
        void Speech.cancel()
        return
      }
      engineRef.current = engine
      const now = Date.now()
      startedAtRef.current = now
      setStartedAt(now)
      moveTo('recording')
      void Haptics.light()
    } catch (error) {
      const code = Speech.speechErrorCode(error)
      if (code === 'cancelled' || phaseRef.current === 'idle') return
      logger.warn('Voice log failed to start', code)
      // This device can't transcribe the language after all; hide the mic.
      if (code === 'unsupported') setAvailable(false)
      report(
        code === 'permission_denied' ? 'permission_denied' : 'failed',
        code
      )
      teardown()
      errorAlert(code)
    }
  }

  const finish = async () => {
    if (phaseRef.current !== 'recording') return
    moveTo('finishing')
    let text = ''
    try {
      text = await Speech.stop()
    } catch (error) {
      logger.warn('Voice log failed to stop', Speech.speechErrorCode(error))
    }
    complete(text)
  }

  const cancel = () => {
    if (phaseRef.current === 'idle') return
    void Speech.cancel()
    report('cancelled')
    teardown()
  }

  // Keep the latest handlers for effects that outlive a render.
  const finishRef = useRef(finish)
  finishRef.current = finish
  const cancelRef = useRef(cancel)
  cancelRef.current = cancel

  // End long or backgrounded recordings, keeping what was heard so far.
  useEffect(() => {
    if (phase !== 'recording') return
    const timeout = setTimeout(() => void finishRef.current(), VOICE_LOG_MAX_MS)
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'background') void finishRef.current()
    })
    return () => {
      clearTimeout(timeout)
      appState.remove()
    }
  }, [phase])

  // Leaving the screen discards an unfinished recording.
  useEffect(() => () => cancelRef.current(), [])

  return {
    /** Show the mic: the binary has the module and a language is supported. */
    available: supported && available,
    phase,
    /** Live transcript while recording; finalized text arrives via the callback. */
    transcript,
    startedAt,
    downloadProgress,
    level,
    start,
    finish,
    cancel,
  }
}
