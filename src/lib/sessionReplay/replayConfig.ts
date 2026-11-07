import type { PostHogConfig } from 'posthog-js'
import {
  maskAttribute,
  maskInputValue,
  maskReplayUrl,
} from '@/lib/sessionReplay/replayMasking'

export const REPLAY_BLOCK_SELECTOR = [
  'img',
  'picture',
  'video',
  'audio',
  'canvas',
  'iframe',
  'object',
  'embed',
  'svg image',
  'input[type="file"]',
  'input[type="hidden"]',

  '[style*="url("]',
  '[data-ph-block]',
].join(', ')

const URL_PROPERTIES = [
  '$current_url',
  '$referrer',
  '$initial_referrer',
  '$initial_current_url',
  '$session_entry_url',
]

type ReplaySend = {
  event: string
  properties?: Record<string, unknown>
}

export const replayBeforeSend =
  (isOpen: () => boolean, added: Record<string, unknown>) =>
  <T extends ReplaySend | null>(event: T): T | null => {
    if (!event || event.event !== '$snapshot' || !isOpen()) return null
    const properties: Record<string, unknown> = {
      ...event.properties,
      ...added,
    }
    for (const name of URL_PROPERTIES) {
      if (typeof properties[name] === 'string')
        properties[name] = maskReplayUrl(properties[name])
    }
    return { ...event, properties }
  }

export type ReplayConfigInput = {
  apiHost: string
  maskText: (text: string, element?: Element | null) => string
  beforeSend: NonNullable<PostHogConfig['before_send']>
}

export function replayConfig({
  apiHost,
  maskText,
  beforeSend,
}: ReplayConfigInput): Partial<PostHogConfig> {
  return {
    api_host: apiHost,

    disable_external_dependency_loading: true,

    opt_out_capturing_by_default: true,
    disable_session_recording: true,

    request_batching: false,
    persistence: 'localStorage',
    cross_subdomain_cookie: false,
    person_profiles: 'never',

    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    rageclick: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_exceptions: false,
    capture_performance: false,
    enable_recording_console_log: false,

    advanced_disable_feature_flags: true,
    advanced_disable_feature_flags_on_first_load: true,
    disable_surveys: true,
    disable_conversations: true,
    disable_product_tours: true,
    disable_web_experiments: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    before_send: beforeSend,
    session_recording: {
      maskTextSelector: '*',
      maskTextFn: maskText,
      maskAllInputs: true,
      maskInputOptions: { password: true },
      maskInputFn: maskInputValue,

      maskAttributeFn: maskAttribute,

      blockClass: 'ph-no-capture',
      blockSelector: REPLAY_BLOCK_SELECTOR,
      captureCanvas: { recordCanvas: false },
      captureJsonLd: false,

      recordHeaders: false,
      recordBody: false,
      maskCapturedNetworkRequestFn: (request) => {
        const fields: Record<string, unknown> = { ...request }

        if ('entryType' in fields || 'initiatorType' in fields) return null
        return { ...request, name: maskReplayUrl(request.name ?? '') }
      },

      sampleRate: 1,
    },
  }
}
