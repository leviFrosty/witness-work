import { fetch as expoFetch } from 'expo/fetch'
import apis from '@/constants/apis'
import { accountSessions } from '@/lib/serverAccount'
import { linkBeforePaidCall } from '@/lib/serverAccount/revenueCatLinkRuntime'
import {
  createScribeClient,
  type ScribeClient,
} from '@/features/scribe/lib/scribeClient'
import { useScribeStatusStore } from '@/features/scribe/stores/status'

let defaultClient: ScribeClient | null = null
let override: ScribeClient | null = null

const buildDefaultClient = (): ScribeClient =>
  createScribeClient({
    urls: {
      status: apis.scribeStatus,
      usage: apis.scribeUsage,
      step: apis.scribeStep,
      transcribe: apis.scribeTranscribe,
    },
    // React Native's own fetch can't read a streaming body.
    streamFetch: expoFetch as unknown as typeof fetch,
    sessions: {
      withSession: (run, call) =>
        accountSessions.withSession((authorization) => run(authorization), {
          signal: call?.signal,
        }),
    },
    linkBeforePaidCall,
  })

/** The client every Scribe AI call uses: ww-api, or a dev fake. */
export function scribeClient(): ScribeClient {
  if (override) return override
  return (defaultClient ??= buildDefaultClient())
}

/**
 * Dev builds: answer every Scribe AI call from `client` (a fake step server for
 * the verification harness), or null to go back to ww-api.
 */
export function setScribeClientOverride(client: ScribeClient | null): void {
  if (!__DEV__) return
  override = client
  useScribeStatusStore.setState({ devClient: client !== null })
}

export const hasScribeClientOverride = (): boolean => override !== null
