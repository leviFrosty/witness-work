import { describe, expect, it } from 'vitest'
import {
  REPLAY_BLOCK_SELECTOR,
  replayBeforeSend,
  replayConfig,
} from '@/lib/sessionReplay/replayConfig'

const config = replayConfig({
  apiHost: 'https://ingest.example.test',
  maskText: (text) => text.replace(/\S/g, '*'),
  beforeSend: (event) => event,
})

describe('replayConfig', () => {
  it('loads nothing from PostHog and records only after the gate opens', () => {
    expect(config.disable_external_dependency_loading).toBe(true)
    expect(config.disable_session_recording).toBe(true)
    expect(config.opt_out_capturing_by_default).toBe(true)
    expect(config.request_batching).toBe(false)
    expect(config.advanced_disable_feature_flags).toBe(true)
    expect(config.advanced_disable_feature_flags_on_first_load).toBe(true)
  })

  it('captures no events of its own', () => {
    for (const option of [
      'autocapture',
      'capture_pageview',
      'capture_pageleave',
      'capture_exceptions',
      'capture_performance',
      'capture_heatmaps',
      'capture_dead_clicks',
      'rageclick',
      'enable_recording_console_log',
    ] as const) {
      expect(config[option]).toBe(false)
    }
    expect(config.person_profiles).toBe('never')
  })

  it('masks all text and every input', () => {
    expect(config.session_recording?.maskTextSelector).toBe('*')
    expect(config.session_recording?.maskAllInputs).toBe(true)
    expect(config.session_recording?.maskInputFn?.('secret')).toBe('******')
  })

  it('never records canvas drawing, requests, headers or bodies', () => {
    const recording = config.session_recording
    expect(recording?.captureCanvas).toEqual({ recordCanvas: false })
    expect(recording?.recordHeaders).toBe(false)
    expect(recording?.recordBody).toBe(false)
    expect(
      recording?.maskCapturedNetworkRequestFn?.({
        name: 'https://api.example.test/contacts',
        entryType: 'resource',
      } as never)
    ).toBeNull()
  })

  it("keeps the page's address, without its query or ids", () => {
    expect(
      config.session_recording?.maskCapturedNetworkRequestFn?.({
        name: 'https://app.example.test/contacts/12ab?q=Maria',
      } as never)
    ).toEqual({ name: 'https://app.example.test/contacts/:id' })
  })

  it('leaves sampling to the app', () => {
    expect(config.session_recording?.sampleRate).toBe(1)
  })

  it('blocks images, the map frame and canvases', () => {
    for (const selector of ['img', 'canvas', 'iframe', 'video']) {
      expect(REPLAY_BLOCK_SELECTOR.split(', ')).toContain(selector)
    }
    expect(config.session_recording?.blockSelector).toBe(REPLAY_BLOCK_SELECTOR)
  })

  it('carries nothing about the User, since the recorder writes it into the recording', () => {
    expect(JSON.stringify(config)).not.toMatch(/token|phc_|account/i)
  })
})

describe('replayBeforeSend', () => {
  const snapshot = (properties: Record<string, unknown> = {}) => ({
    event: '$snapshot',
    properties,
  })

  it('passes a snapshot while the gate is open', () => {
    const send = replayBeforeSend(() => true, { app_platform: 'web' })
    expect(send(snapshot())?.properties).toMatchObject({ app_platform: 'web' })
  })

  it('drops a snapshot the moment the gate closes', () => {
    let open = true
    const send = replayBeforeSend(() => open, {})
    expect(send(snapshot())).not.toBeNull()
    open = false
    expect(send(snapshot())).toBeNull()
  })

  it('drops every other event, so nothing is counted twice', () => {
    const send = replayBeforeSend(() => true, {})
    for (const event of [
      '$pageview',
      '$autocapture',
      '$opt_in',
      '$exception',
      'contact_created',
      '$feature_flag_called',
    ]) {
      expect(send({ event, properties: {} })).toBeNull()
    }
    expect(send(null)).toBeNull()
  })

  it('takes ids and queries out of the addresses an event carries', () => {
    const send = replayBeforeSend(() => true, {})
    const sent = send(
      snapshot({
        $current_url: 'https://app.example.test/contacts/12ab?q=Maria#x',
        $referrer: 'https://example.test/path?x=1',
        $browser: 'Chrome',
      })
    )
    expect(sent?.properties).toMatchObject({
      $current_url: 'https://app.example.test/contacts/:id',
      $referrer: 'https://example.test/path',
      $browser: 'Chrome',
    })
  })
})
