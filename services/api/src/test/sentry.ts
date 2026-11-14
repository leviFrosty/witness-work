import {
  CloudflareClient,
  createTransport,
  getCurrentScope,
  linkedErrorsIntegration,
  type ErrorEvent,
} from '@sentry/cloudflare'
import { createSentryConfig } from '../sentry'
import type { Environment } from '../types'

/** What Sentry would send, after the worker's own `beforeSend`. */
export interface SentryRecorder {
  /** Waits for captured events to finish processing, then lists them. */
  events(): Promise<ErrorEvent[]>
  /** Detaches the client, so later captures go nowhere. */
  stop(): void
}

/**
 * Installs a real Sentry client as the current one, configured like the
 * worker's (`createSentryConfig`) plus the linked-errors integration that
 * reports each `cause`, which records every event its `beforeSend` lets
 * through instead of sending it.
 */
export const recordSentryEvents = (): SentryRecorder => {
  const config = createSentryConfig({
    SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0',
  } as Environment)
  const recorded: ErrorEvent[] = []
  const client = new CloudflareClient({
    ...config,
    dsn: config.dsn,
    defaultIntegrations: false,
    integrations: [linkedErrorsIntegration()],
    stackParser: () => [],
    transport: (options) => createTransport(options, async () => ({})),
    beforeSend: (event, hint) => {
      const scrubbed = config.beforeSend!(event, hint) as ErrorEvent | null
      if (scrubbed) recorded.push(scrubbed)
      return null
    },
  })
  getCurrentScope().setClient(client)
  client.init()
  return {
    events: async () => {
      await client.flush(1_000)
      return recorded
    },
    stop: () => getCurrentScope().setClient(undefined),
  }
}
