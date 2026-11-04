import type { PostHogConfig } from 'posthog-js'
import {
  maskAttribute,
  maskInputValue,
  maskReplayUrl,
} from '@/lib/sessionReplay/replayMasking'

/**
 * The recorder's settings (ADR 0043). Everything here is local, so a switch in
 * the PostHog project can't loosen it: for each masking field the code wins.
 * The recorder writes this object into the recording (`$posthog_config`), so it
 * holds no secret and nothing about the User.
 */

/** What a recording never shows; the element is swapped for a same-size block. */
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
  // Anything drawn from an address in its style (react-native-web's `Image`
  // is a background); style changes later in a session aren't masked.
  '[style*="url("]',
  '[data-ph-block]',
].join(', ')

/** URL properties on a recording's events. */
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

/**
 * The only event the replay client sends is a recording's `$snapshot`, and only
 * while `isOpen()`: the gate is checked on every send, so switching it off
 * stops a recording that is still buffering. Usage events go through the app's
 * own client, once.
 */
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
    // The recorder is in the bundle; nothing loads from PostHog (ADR 0037 §5).
    disable_external_dependency_loading: true,
    // Nothing is captured until the gate opens, and the gate can close again.
    opt_out_capturing_by_default: true,
    disable_session_recording: true,
    // Send each recording chunk as it's made. A batching queue would hold
    // chunks made while the gate was open and send them after it closed.
    request_batching: false,
    persistence: 'localStorage',
    cross_subdomain_cookie: false,
    person_profiles: 'never',
    // The app's own client sends events, flags, surveys and crash reports.
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    rageclick: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_exceptions: false,
    capture_performance: false,
    enable_recording_console_log: false,
    // Not `advanced_disable_flags`: that also stops the project's replay
    // settings from loading. No flag is asked for or evaluated here.
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
      // Text and fields.
      maskTextSelector: '*',
      maskTextFn: maskText,
      maskAllInputs: true,
      maskInputOptions: { password: true },
      maskInputFn: maskInputValue,
      // Attributes: only the ones the page can't be drawn without.
      maskAttributeFn: maskAttribute,
      // Images, the map frame and canvases.
      blockClass: 'ph-no-capture',
      blockSelector: REPLAY_BLOCK_SELECTOR,
      captureCanvas: { recordCanvas: false },
      captureJsonLd: false,
      // No network, headers, bodies or timing. The page's own address, which
      // the recorder also passes here, loses its query, hash and ids.
      recordHeaders: false,
      recordBody: false,
      maskCapturedNetworkRequestFn: (request) => {
        const fields: Record<string, unknown> = { ...request }
        // A request has a type; the page's own address is only a name.
        if ('entryType' in fields || 'initiatorType' in fields) return null
        return { ...request, name: maskReplayUrl(request.name ?? '') }
      },
      // Sampling is ours (`replaySampling.ts`), once per tab session, so the
      // SDK's own draw can't drop a session we chose, or add one we didn't.
      sampleRate: 1,
    },
  }
}
