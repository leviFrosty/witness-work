import { describe, expect, it, vi } from 'vitest'
import type { FrameEvent } from '../../../src/lib/turnstileFrame/protocol'
import { renderWidget, type TurnstileApi } from './widget'

const params = {
  siteKey: '1x00000000000000000000AA',
  action: 'web-recovery',
} as const

function setup(render: TurnstileApi['render']) {
  const events: FrameEvent[] = []
  const element = {} as HTMLElement
  const run = () =>
    renderWidget({
      load: async () => ({ render: vi.fn(render) }),
      element,
      params,
      emit: (event) => events.push(event),
    })
  return { events, run, element }
}

describe('renderWidget', () => {
  it('renders the managed widget for the site key and action, then says ready', async () => {
    let options: Parameters<TurnstileApi['render']>[1] | undefined
    const { events, run } = setup((_, given) => {
      options = given
      return 'widget-1'
    })
    await run()
    expect(options).toMatchObject({
      sitekey: params.siteKey,
      action: 'web-recovery',
      theme: 'auto',
      size: 'flexible',
      'response-field': false,
    })
    expect(events).toEqual([{ type: 'ready' }])
  })

  it('passes on the widget’s token, expiry, error and timeout', async () => {
    let options: Parameters<TurnstileApi['render']>[1] | undefined
    const { events, run } = setup((_, given) => {
      options = given
      return 'widget-1'
    })
    await run()
    options!.callback('tok')
    options!['expired-callback']()
    options!['error-callback']()
    options!['timeout-callback']()
    expect(events).toEqual([
      { type: 'ready' },
      { type: 'token', token: 'tok' },
      { type: 'expired' },
      { type: 'error', reason: 'check' },
      { type: 'timeout' },
    ])
  })

  it('reports the script, not ready, when render returns nothing', async () => {
    for (const result of [undefined, null, '']) {
      const { events, run } = setup(() => result)
      await run()
      expect(events).toEqual([{ type: 'error', reason: 'script' }])
    }
  })

  it('reports the script when render throws or the script doesn’t load', async () => {
    const thrown = setup(() => {
      throw new Error('bad sitekey')
    })
    await thrown.run()
    expect(thrown.events).toEqual([{ type: 'error', reason: 'script' }])

    const events: FrameEvent[] = []
    await renderWidget({
      load: () => Promise.reject(new Error('blocked')),
      element: {} as HTMLElement,
      params,
      emit: (event) => events.push(event),
    })
    expect(events).toEqual([{ type: 'error', reason: 'script' }])
  })
})
