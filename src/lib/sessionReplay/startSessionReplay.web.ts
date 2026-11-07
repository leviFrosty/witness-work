import Constants from 'expo-constants'
import { _i18n } from '@/lib/locales'
import {
  analyticsEventsAllowed,
  analyticsProductionBuild,
} from '@/lib/analyticsPolicy'
import { createReplayController } from '@/lib/sessionReplay/replayController'
import {
  readReplayCountry,
  replayCountry,
  subscribeReplayCountry,
} from '@/lib/sessionReplay/replayCountry'
import {
  replayConfig,
  replayBeforeSend,
} from '@/lib/sessionReplay/replayConfig'
import { type ReplayGateInput } from '@/lib/sessionReplay/replayGate'
import {
  collectInterfaceStrings,
  createTextMasker,
} from '@/lib/sessionReplay/replayMasking'
import {
  REPLAY_SAMPLE_RATE,
  sessionSampled,
} from '@/lib/sessionReplay/replaySampling'
import { isStorageLocked } from '@/stores/mmkv'
import { usePreferences } from '@/stores/preferences'

const extra = Constants.expoConfig?.extra as
  | { posthogProjectToken?: string; posthogHost?: string; appVariant?: string }
  | undefined

type ReplayTestHook = {
  sampleRate?: number
  asProduction?: boolean
  debug?: boolean

  allowBots?: boolean
}
const testHook = (): ReplayTestHook | undefined =>
  extra?.appVariant === 'development'
    ? (globalThis as { __WW_REPLAY_TEST__?: ReplayTestHook }).__WW_REPLAY_TEST__
    : undefined

let activeMasker: {
  table: unknown
  mask: ReturnType<typeof createTextMasker>
} | null = null

const maskText = (text: string, element?: Element | null): string => {
  const table = _i18n.translations[_i18n.locale]
  const cached = activeMasker
  if (cached && cached.table === table) return cached.mask(text, element)
  const mask = createTextMasker(collectInterfaceStrings(table))
  activeMasker = { table, mask }
  return mask(text, element)
}

const gateInputs = (): ReplayGateInput => {
  const preferences = usePreferences.getState()
  const hook = testHook()
  return {
    sampled: sessionSampled(
      hook?.sampleRate ?? REPLAY_SAMPLE_RATE,
      safeSessionStorage()
    ),
    analyticsAllowed:
      analyticsEventsAllowed() &&
      !isStorageLocked() &&
      usePreferences.persist.hasHydrated() &&
      preferences.analyticsEnabled,
    production: analyticsProductionBuild() || hook?.asProduction === true,
    dataProtectionMode: preferences.dataProtectionMode,
    country: replayCountry(),
    optedIn: preferences.sessionReplayOptIn,
  }
}

const safeSessionStorage = (): Storage | undefined => {
  try {
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}

let started = false

export function startSessionReplay(): void {
  if (started) return
  started = true
  const token = extra?.posthogProjectToken
  const host = extra?.posthogHost
  if (!token || !host) return

  const controller = createReplayController({
    inputs: gateInputs,
    load: async () => {
      const { default: posthog } = await import('posthog-js/full/no-external')
      const client = posthog.init(
        token,
        {
          ...replayConfig({
            apiHost: host,
            maskText,
            beforeSend: replayBeforeSend(controller.isOpen, {
              app_platform: 'web',
              app_variant: extra?.appVariant ?? 'unknown',
            }),
          }),
          opt_out_useragent_filter: testHook()?.allowBots === true,
        },
        'ww-replay'
      )
      if (testHook()?.debug) client.debug(true)
      return {
        start: () => {
          client.opt_in_capturing({ captureEventName: false })
          client.startSessionRecording()
        },
        stop: () => {
          client.stopSessionRecording()
          client.opt_out_capturing()
          client.reset()
        },
      }
    },
  })

  usePreferences.subscribe(controller.evaluate)
  usePreferences.persist.onFinishHydration(controller.evaluate)
  subscribeReplayCountry(controller.evaluate)
  readReplayCountry()
  controller.evaluate()
}
