import { afterEach, beforeEach, expect, it, vi } from 'vitest'

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
  await expect(links.launchURL()).resolves.toBe(
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

  expect(links.linkSinceLaunch()).toBe('witnesswork://schedule/2026-10-23')
  await expect(links.launchURL()).resolves.toBe(
    'witnesswork://schedule/2026-10-23'
  )
})

it('stops keeping links once the app listens for them itself', async () => {
  const links = await load()
  links.recordLaunchLinks()
  links.stopRecordingLaunchLinks()
  expect(runtime.removed).toBe(1)
  expect(links.linkSinceLaunch()).toBeNull()
})

it('waits for a slow launch URL longer than React Navigation would', async () => {
  vi.useFakeTimers()
  const links = await load()
  runtime.initialURL = () =>
    new Promise((resolve) =>
      setTimeout(() => resolve('witnesswork://day'), 600)
    )
  const url = links.launchURL()
  await vi.advanceTimersByTimeAsync(600)
  await expect(url).resolves.toBe('witnesswork://day')
})

it('opens Home when the launch URL never answers', async () => {
  vi.useFakeTimers()
  const links = await load()
  runtime.initialURL = () => new Promise(() => {})
  const url = links.launchURL()
  await vi.advanceTimersByTimeAsync(2_000)
  await expect(url).resolves.toBeNull()
})
