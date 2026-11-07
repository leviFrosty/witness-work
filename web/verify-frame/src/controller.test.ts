import { describe, expect, it, vi } from 'vitest'
import {
  frameMessage,
  initMessage,
} from '../../../src/lib/turnstileFrame/protocol'
import { createVerifyController } from './controller'

const APP = 'https://app-dev.witnesswork.app'
const ALLOWED = ['http://localhost:*', 'http://127.0.0.1:*', APP]

function setup() {
  const parent = { postMessage: vi.fn() }
  const controller = createVerifyController({
    allowedOrigins: ALLOWED,
    parent,
    action: 'web-recovery',
  })
  const fromParent = (overrides = {}) =>
    controller.receive({
      origin: APP,
      source: parent,
      data: initMessage(),
      ...overrides,
    })
  return { parent, controller, fromParent }
}

describe('createVerifyController', () => {
  it('says nothing until its parent greets it from an app origin', () => {
    const { parent, controller, fromParent } = setup()
    controller.emit({ type: 'token', token: 'abc' })
    expect(parent.postMessage).not.toHaveBeenCalled()
    fromParent()
    expect(parent.postMessage).toHaveBeenCalledWith(
      frameMessage('web-recovery', { type: 'token', token: 'abc' }),
      APP
    )
  })

  it('posts only to the origin that greeted it, never `*`', () => {
    const { parent, controller, fromParent } = setup()
    fromParent({ origin: 'http://localhost:8790' })
    controller.emit({ type: 'ready' })
    controller.emit({ type: 'expired' })
    expect(parent.postMessage).toHaveBeenCalledTimes(2)
    for (const call of parent.postMessage.mock.calls)
      expect(call[1]).toBe('http://localhost:8790')
  })

  it('ignores a greeting from an origin that isn’t its environment’s app', () => {
    const { parent, controller, fromParent } = setup()
    for (const origin of [
      'https://app.witnesswork.app',
      'https://evil.example',
      'https://app-dev.witnesswork.app.evil.example',
      'http://app-dev.witnesswork.app',
      'http://localhost',
      'http://localhost:8790.evil.example',
      'null',
    ])
      fromParent({ origin })
    controller.emit({ type: 'token', token: 'abc' })
    expect(parent.postMessage).not.toHaveBeenCalled()
  })

  it('ignores a greeting from any window but its parent', () => {
    const { parent, controller, fromParent } = setup()
    fromParent({ source: { postMessage() {} } })
    fromParent({ source: null })
    controller.emit({ type: 'token', token: 'abc' })
    expect(parent.postMessage).not.toHaveBeenCalled()
  })

  it('ignores anything but the init', () => {
    const { parent, controller, fromParent } = setup()
    for (const data of [
      null,
      'init',
      { ...initMessage(), extra: true },
      { ...initMessage(), version: 2 },
      frameMessage('web-recovery', { type: 'ready' }),
    ])
      fromParent({ data })
    controller.emit({ type: 'ready' })
    expect(parent.postMessage).not.toHaveBeenCalled()
  })

  it('keeps the first app origin; a later greeting can’t move it', () => {
    const { parent, controller, fromParent } = setup()
    fromParent()
    fromParent({ origin: 'http://localhost:8790' })
    controller.emit({ type: 'ready' })
    expect(parent.postMessage).toHaveBeenCalledOnce()
    expect(parent.postMessage.mock.calls[0]?.[1]).toBe(APP)
  })

  it('does nothing as a top window', () => {
    const controller = createVerifyController({
      allowedOrigins: ALLOWED,
      parent: null,
      action: 'web-recovery',
    })
    controller.receive({ origin: APP, source: null, data: initMessage() })
    expect(() => controller.emit({ type: 'ready' })).not.toThrow()
  })

  it('never sends a token that isn’t one', () => {
    const { parent, controller, fromParent } = setup()
    fromParent()
    controller.emit({ type: 'token', token: 'a'.repeat(2049) })
    controller.emit({ type: 'token', token: '' })
    expect(parent.postMessage).not.toHaveBeenCalled()
  })

  it('holds only the latest events before the greeting', () => {
    const { parent, controller, fromParent } = setup()
    for (let i = 0; i < 20; i++)
      controller.emit({ type: 'token', token: `t${i}` })
    fromParent()
    expect(parent.postMessage.mock.calls.length).toBeLessThanOrEqual(8)
    expect(parent.postMessage).toHaveBeenLastCalledWith(
      frameMessage('web-recovery', { type: 'token', token: 't19' }),
      APP
    )
  })
})
