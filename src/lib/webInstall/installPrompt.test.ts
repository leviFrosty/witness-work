import { afterEach, describe, expect, it, vi } from 'vitest'

class FakeWindow {
  handlers = new Map<string, Array<(event: Event) => void>>()
  addEventListener(type: string, handler: (event: Event) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler])
  }
  fire(type: string, event: Event = new Event(type)) {
    this.handlers.get(type)?.forEach((handler) => handler(event))
  }
}

async function load() {
  vi.resetModules()
  const fake = new FakeWindow()
  vi.stubGlobal('window', fake)
  const mod = await import('@/lib/webInstall/installPrompt')
  mod.resetInstallPrompt()
  return { fake, ...mod }
}

const promptEvent = (outcome: 'accepted' | 'dismissed') =>
  Object.assign(new Event('beforeinstallprompt'), {
    prompt: vi.fn(async () => undefined),
    userChoice: Promise.resolve({ outcome }),
  })

afterEach(() => vi.unstubAllGlobals())

describe('the install prompt', () => {
  it('keeps the browser’s event and stops its own mini-infobar', async () => {
    const { fake, startInstallPromptCapture, installPromptState } = await load()
    startInstallPromptCapture()
    startInstallPromptCapture()
    const event = promptEvent('accepted')
    const preventDefault = vi.spyOn(event, 'preventDefault')
    fake.fire('beforeinstallprompt', event)
    expect(preventDefault).toHaveBeenCalled()
    expect(installPromptState().event).toBe(event)
    expect(fake.handlers.get('beforeinstallprompt')).toHaveLength(1)
  })

  it('calls prompt() once and reports the User’s choice', async () => {
    const {
      fake,
      startInstallPromptCapture,
      promptInstall,
      installPromptState,
    } = await load()
    startInstallPromptCapture()
    const event = promptEvent('accepted')
    fake.fire('beforeinstallprompt', event)
    expect(await promptInstall()).toBe('accepted')
    expect(event.prompt).toHaveBeenCalledTimes(1)

    expect(installPromptState().event).toBeNull()
    expect(await promptInstall()).toBeNull()
  })

  it('reports a prompt the User closed', async () => {
    const { fake, startInstallPromptCapture, promptInstall } = await load()
    startInstallPromptCapture()
    fake.fire('beforeinstallprompt', promptEvent('dismissed'))
    expect(await promptInstall()).toBe('dismissed')
  })

  it('records the install', async () => {
    const { fake, startInstallPromptCapture, installPromptState } = await load()
    startInstallPromptCapture()
    fake.fire('beforeinstallprompt', promptEvent('accepted'))
    fake.fire('appinstalled')
    expect(installPromptState()).toEqual({ event: null, installed: true })
  })
})
