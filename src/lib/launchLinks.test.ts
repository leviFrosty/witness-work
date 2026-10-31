import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  urlListener: undefined as undefined | ((event: { url: string }) => void),
  initialURL: (): Promise<string | null> => Promise.resolve(null),
  removed: 0,
}))

vi.mock('expo-linking', () => ({
  addEventListener: (_: string, listener: (event: { url: string }) => void) => {
    runtime.urlListener = listener
    return { remove: () => runtime.removed++ }
  },
  getInitialURL: () => runtime.initialURL(),
}))

beforeEach(() => {
  vi.resetModules()
  runtime.urlListener = undefined
  runtime.initialURL = () => Promise.resolve(null)
  runtime.removed = 0
})
afterEach(() => {
  vi.useRealTimers()
})

const load = () => import('@/lib/launchLinks')

it('opens the link that launched the app', async () => {
  const links = await load()
  links.recordLaunchLinks()
  runtime.initialURL = () =>
    Promise.resolve('witnesswork://schedule/2026-10-23')
  await expect(links.launchURL('navigation')).resolves.toBe(
    'witnesswork://schedule/2026-10-23'
  )
})

it('keeps a link tapped while the app starts, newest first', async () => {
  const links = await load()
  links.recordLaunchLinks()
  runtime.initialURL = () => Promise.resolve('witnesswork://home')
  // Nothing else listens yet; React Native would drop these.
  runtime.urlListener?.({ url: 'witnesswork://add-time' })
  runtime.urlListener?.({ url: 'witnesswork://schedule/2026-10-23' })

  expect(links.linkSinceLaunch('navigation')).toBe(
    'witnesswork://schedule/2026-10-23'
  )
  await expect(links.launchURL('contact-import')).resolves.toBe(
    'witnesswork://schedule/2026-10-23'
  )
})

it('stops keeping links once the app listens for them itself', async () => {
  const links = await load()
  links.recordLaunchLinks()
  links.stopRecordingLaunchLinks()
  expect(runtime.removed).toBe(1)
  expect(links.linkSinceLaunch('navigation')).toBeNull()
})

it('waits for a slow launch URL longer than React Navigation would', async () => {
  vi.useFakeTimers()
  const links = await load()
  runtime.initialURL = () =>
    new Promise((resolve) =>
      setTimeout(() => resolve('witnesswork://day'), 600)
    )
  const url = links.launchURL('navigation')
  await vi.advanceTimersByTimeAsync(600)
  await expect(url).resolves.toBe('witnesswork://day')
})

it('opens Home when the launch URL never answers', async () => {
  vi.useFakeTimers()
  const links = await load()
  runtime.initialURL = () => new Promise(() => {})
  const url = links.launchURL('navigation')
  await vi.advanceTimersByTimeAsync(2_000)
  await expect(url).resolves.toBeNull()
})

describe('a remounted reader', () => {
  it('never handles a link tapped during startup again', async () => {
    const links = await load()
    links.recordLaunchLinks()
    runtime.urlListener?.({ url: 'witnesswork://import-contact/abc' })
    links.stopRecordingLaunchLinks()

    // The contact import listener mounts, then mounts again (an unlock, a
    // remounted tree): it asks for the launch link each time.
    await expect(links.launchURL('contact-import')).resolves.toBe(
      'witnesswork://import-contact/abc'
    )
    await expect(links.launchURL('contact-import')).resolves.toBeNull()
    // Navigation reads it on its own, once.
    expect(links.linkSinceLaunch('navigation')).toBe(
      'witnesswork://import-contact/abc'
    )
    expect(links.linkSinceLaunch('navigation')).toBeNull()
    await expect(links.launchURL('navigation')).resolves.toBeNull()
  })

  it('never handles the link that launched the app again', async () => {
    const links = await load()
    runtime.initialURL = () => Promise.resolve('witnesswork://day')
    await expect(links.launchURL('handoff')).resolves.toBe('witnesswork://day')
    // `getInitialURL` keeps answering it for the app's lifetime.
    await expect(links.launchURL('handoff')).resolves.toBeNull()
    await expect(links.launchURL('buddy-invite')).resolves.toBe(
      'witnesswork://day'
    )
  })

  it('still gets a newer link tapped while the app starts', async () => {
    const links = await load()
    links.recordLaunchLinks()
    runtime.initialURL = () => Promise.resolve('witnesswork://home')
    await expect(links.launchURL('navigation')).resolves.toBe(
      'witnesswork://home'
    )
    runtime.urlListener?.({ url: 'witnesswork://add-time' })
    expect(links.linkSinceLaunch('navigation')).toBe('witnesswork://add-time')
  })

  it('carries the launch link across a reload without handing it out', async () => {
    const links = await load()
    runtime.initialURL = () => Promise.resolve('witnesswork://day')
    await expect(links.pendingLaunchURL()).resolves.toBe('witnesswork://day')
    await expect(links.launchURL('navigation')).resolves.toBe(
      'witnesswork://day'
    )
  })
})

it('has no launch links on the web, so a checkout return is never one', async () => {
  const web = await import('@/lib/launchLinks.web')
  web.recordLaunchLinks()
  await expect(web.launchURL('navigation')).resolves.toBeNull()
  await expect(web.pendingLaunchURL()).resolves.toBeNull()
  expect(web.linkSinceLaunch('navigation')).toBeNull()
})
