import { requireOptionalNativeModule } from 'expo-modules-core'
import type { EventSubscription } from 'expo-modules-core'

export type SpeechPermissionStatus = 'granted' | 'denied' | 'undetermined'

export interface SpeechPermissions {
  status: SpeechPermissionStatus
  microphone: SpeechPermissionStatus

  speechRecognition: SpeechPermissionStatus | 'notRequired'
}

export type SpeechEngine =
  | 'speechTranscriber'
  | 'dictationTranscriber'
  | 'legacy'
  | 'androidOnDevice'

export type SpeechAvailability =
  | { available: true; locale: string; engine: SpeechEngine }
  | { available: false }

export interface StartOptions {
  localeCandidates: string[]

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

  playCue?(uri: string): void
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

export function speechErrorCode(error: unknown): SpeechErrorCode {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''
  return NATIVE_CODES[code] ?? 'failed'
}

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

export function requestPermissions(): Promise<SpeechPermissions> {
  return required().requestPermissions()
}

export function start(options: StartOptions) {
  return required().start({
    localeCandidates: options.localeCandidates,
    contextualStrings: options.contextualStrings ?? [],
  })
}

export function stop(): Promise<string> {
  return required().stop()
}

export function cancel(): Promise<void> {
  return native ? native.cancel() : Promise.resolve()
}

export function playCue(uri: string): void {
  if ((native?.speechTranscriptionVersion ?? 0) < 2) return
  void native?.playCue?.(uri)
}

export function addListener<E extends keyof Events>(
  event: E,
  listener: Events[E]
): EventSubscription {
  return required().addListener(event, listener)
}
