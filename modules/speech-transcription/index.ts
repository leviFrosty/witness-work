import { requireOptionalNativeModule } from 'expo-modules-core'
import type { EventSubscription } from 'expo-modules-core'

/**
 * On-device speech-to-text (ADR 0018). This file is the platform-neutral
 * contract: iOS implements it in `ios/` (SpeechAnalyzer, or an on-device
 * SFSpeechRecognizer before iOS 26). An Android implementation can plug in
 * later by registering a `SpeechTranscription` module with the same functions
 * and events; until then `isSupported()` is false and voice logs stay hidden.
 *
 * The contract forbids server recognition: an implementation must report
 * unavailable rather than send audio off the device.
 */

export type SpeechPermissionStatus = 'granted' | 'denied' | 'undetermined'

export interface SpeechPermissions {
  /** Combined status of every permission recording needs. */
  status: SpeechPermissionStatus
  microphone: SpeechPermissionStatus
  /** IOS 26+ transcribes with microphone access alone. */
  speechRecognition: SpeechPermissionStatus | 'notRequired'
}

export type SpeechEngine =
  | 'speechTranscriber'
  | 'dictationTranscriber'
  | 'legacy'

export type SpeechAvailability =
  | { available: true; locale: string; engine: SpeechEngine }
  | { available: false }

export interface StartOptions {
  /** BCP-47 languages to try in order; the device's languages follow. */
  localeCandidates: string[]
  /** Words to favor, such as contact names. Used on-device only. */
  contextualStrings?: string[]
}

export type SpeechErrorCode =
  | 'permission_denied'
  | 'unsupported'
  | 'model_unavailable'
  | 'audio_unavailable'
  | 'busy'
  | 'cancelled'
  | 'failed'

type Events = {
  onTranscript: (event: { text: string }) => void
  onLevel: (event: { level: number }) => void
  onPreparing: (event: { progress?: number }) => void
  onEnd: (event: { text: string; reason: 'interrupted' }) => void
}

interface SpeechTranscriptionNative {
  speechTranscriptionVersion?: number
  getAvailability(localeCandidates: string[]): Promise<SpeechAvailability>
  getPermissions(): Promise<SpeechPermissions>
  requestPermissions(): Promise<SpeechPermissions>
  start(
    options: Required<StartOptions>
  ): Promise<{ locale: string; engine: SpeechEngine }>
  stop(): Promise<string>
  cancel(): Promise<void>
  addListener<E extends keyof Events>(
    event: E,
    listener: Events[E]
  ): EventSubscription
}

const native = requireOptionalNativeModule<SpeechTranscriptionNative>(
  'SpeechTranscription'
)

const NATIVE_CODES: Record<string, SpeechErrorCode> = {
  ERR_SPEECH_PERMISSION_DENIED: 'permission_denied',
  ERR_SPEECH_UNSUPPORTED: 'unsupported',
  ERR_SPEECH_MODEL_UNAVAILABLE: 'model_unavailable',
  ERR_SPEECH_AUDIO_UNAVAILABLE: 'audio_unavailable',
  ERR_SPEECH_BUSY: 'busy',
  ERR_SPEECH_CANCELLED: 'cancelled',
}

/** Maps a native rejection to a stable code; never inspects localized text. */
export function speechErrorCode(error: unknown): SpeechErrorCode {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''
  return NATIVE_CODES[code] ?? 'failed'
}

/** Whether this binary ships the module (false on Android and older builds). */
export function isSupported(): boolean {
  return !!native?.speechTranscriptionVersion
}

const required = (): SpeechTranscriptionNative => {
  if (!native)
    throw Object.assign(new Error('unsupported'), {
      code: 'ERR_SPEECH_UNSUPPORTED',
    })
  return native
}

export function getAvailability(
  localeCandidates: string[]
): Promise<SpeechAvailability> {
  if (!native) return Promise.resolve({ available: false })
  return native.getAvailability(localeCandidates)
}

export function getPermissions(): Promise<SpeechPermissions> {
  return required().getPermissions()
}

/** Prompts only for permissions that are still undetermined. */
export function requestPermissions(): Promise<SpeechPermissions> {
  return required().requestPermissions()
}

export function start(options: StartOptions) {
  return required().start({
    localeCandidates: options.localeCandidates,
    contextualStrings: options.contextualStrings ?? [],
  })
}

/** Ends the recording and resolves the final transcript ('' when none). */
export function stop(): Promise<string> {
  return required().stop()
}

export function cancel(): Promise<void> {
  return native ? native.cancel() : Promise.resolve()
}

export function addListener<E extends keyof Events>(
  event: E,
  listener: Events[E]
): EventSubscription {
  return required().addListener(event, listener)
}
