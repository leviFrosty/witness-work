import { Platform } from 'react-native'
import { appVersion } from '@/lib/appUpdate'
import { scribeClient } from '@/features/scribe/lib/defaultClient'
import { appLocale, deviceTimeZone } from '@/features/scribe/lib/locale'
import { ulid } from '@/features/scribe/lib/ulid'
import { readScribeStores } from '@/features/scribe/runtime/snapshot'
import { noteScribeFailure } from '@/features/scribe/runtime/status'
import type { ScribeRuntimeDeps } from '@/features/scribe/runtime/turnLoop'
import { scribeLimits } from '@/features/scribe/stores/status'
import { SCRIBE_TOOLS, scribeTool } from '@/features/scribe/tools'

/**
 * What a turn runs against in the app: ww-api (or the dev fake) and the live
 * stores.
 */
export const scribeRuntime = (): ScribeRuntimeDeps => ({
  client: scribeClient,
  stores: readScribeStores,
  now: () => new Date(),
  ulid: () => ulid(),
  app: () => ({
    version: appVersion() ?? '0.0.0',
    platform: Platform.OS === 'android' ? 'android' : 'ios',
    locale: appLocale(),
  }),
  tz: deviceTimeZone,
  limits: scribeLimits,
  tools: SCRIBE_TOOLS,
  tool: scribeTool,
  onFailure: noteScribeFailure,
})
