import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  // Survives the reload, as MMKV does.
  storage: new Map<string, string>(),
  initialURL: null as string | null,
  lastResponse: null as unknown,
  urlListener: undefined as undefined | ((event: { url: string }) => void),
}))

vi.mock('@/stores/mmkv', () => ({
  mmkvStorage: {
    getString: (key: string) => runtime.storage.get(key),
    set: (key: string, value: string) => runtime.storage.set(key, value),
    delete: (key: string) => runtime.storage.delete(key),
  },
}))
vi.mock('expo-linking', () => ({
  addEventListener: (_: string, listener: (event: { url: string }) => void) => {
    runtime.urlListener = listener
    return { remove: () => {} }
  },
  getInitialURL: () => Promise.resolve(runtime.initialURL),
}))
vi.mock('expo-notifications', () => ({
  getLastNotificationResponse: () => runtime.lastResponse,
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))

const tap = {
  actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
  notification: {
    date: 1_792_000_000,
    request: {
      identifier: 'visit-reminder',
      content: { data: { reminder: { kind: 'visit', id: 'visit-1' } } },
    },
  },
}

/** A fresh JS context, as after a reload: module state starts over. */
const launch = async () => {
  vi.resetModules()
  return {
    handoff: await import('@/app/launch/reloadHandoff'),
    links: await import('@/lib/launchLinks'),
  }
}

beforeEach(() => {
  runtime.storage.clear()
  runtime.initialURL = null
  runtime.lastResponse = null
})
afterEach(() => {
  vi.useRealTimers()
})

it('carries the notification tap that launched the app across the reload', async () => {
  runtime.lastResponse = tap
  const first = await launch()
  await first.handoff.handOffLaunchBeforeReload()

  // The reloaded context: native no longer has the tap.
  runtime.lastResponse = null
  const reloaded = await launch()
  reloaded.handoff.restoreLaunchAfterReload()
  expect(reloaded.handoff.takeHandedOffNotificationResponse()).toEqual(tap)
  // Once.
  expect(reloaded.handoff.takeHandedOffNotificationResponse()).toBeNull()
  expect(runtime.storage.size).toBe(0)
})

it('carries the link that launched the app across the reload', async () => {
  runtime.initialURL = 'witnesswork://schedule/2026-10-23'
  const first = await launch()
  await first.handoff.handOffLaunchBeforeReload()

  runtime.initialURL = null
  const reloaded = await launch()
  reloaded.handoff.restoreLaunchAfterReload()
  await expect(reloaded.links.launchURL()).resolves.toBe(
    'witnesswork://schedule/2026-10-23'
  )
  expect(reloaded.handoff.takeHandedOffNotificationResponse()).toBeNull()
})

it('carries a link that brought a background launch to the front', async () => {
  // Launched in the background (no launch link); the link comes as an event
  // while the splash shows, before the storage-unlock reload.
  const first = await launch()
  first.links.recordLaunchLinks()
  runtime.urlListener?.({ url: 'witnesswork://schedule/2026-10-23' })
  await first.handoff.handOffLaunchBeforeReload()

  const reloaded = await launch()
  reloaded.handoff.restoreLaunchAfterReload()
  await expect(reloaded.links.launchURL()).resolves.toBe(
    'witnesswork://schedule/2026-10-23'
  )
})

it('keeps a link tapped after the reload over the handed-off one', async () => {
  runtime.initialURL = 'witnesswork://add-time'
  const first = await launch()
  await first.handoff.handOffLaunchBeforeReload()

  const reloaded = await launch()
  reloaded.links.recordLaunchLinks()
  reloaded.handoff.restoreLaunchAfterReload()
  expect(reloaded.links.linkSinceLaunch()).toBe('witnesswork://add-time')
  runtime.urlListener?.({ url: 'witnesswork://schedule/2026-10-23' })
  await expect(reloaded.links.launchURL()).resolves.toBe(
    'witnesswork://schedule/2026-10-23'
  )
})

it('forgets the handoff when the reload doesn’t happen', async () => {
  runtime.lastResponse = tap
  const first = await launch()
  await first.handoff.handOffLaunchBeforeReload()
  first.handoff.dropLaunchHandoff()

  const next = await launch()
  next.handoff.restoreLaunchAfterReload()
  expect(next.handoff.takeHandedOffNotificationResponse()).toBeNull()
})

it('saves nothing when nothing launched the app', async () => {
  const first = await launch()
  await first.handoff.handOffLaunchBeforeReload()
  expect(runtime.storage.size).toBe(0)

  const reloaded = await launch()
  reloaded.handoff.restoreLaunchAfterReload()
  expect(reloaded.handoff.takeHandedOffNotificationResponse()).toBeNull()
  await expect(reloaded.links.launchURL()).resolves.toBeNull()
})

it('drops a handoff from a reload that never happened', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  runtime.lastResponse = tap
  const first = await launch()
  await first.handoff.handOffLaunchBeforeReload()

  // The app was killed instead; this is a later, ordinary launch.
  vi.setSystemTime(Date.now() + 5 * 60_000)
  runtime.lastResponse = null
  const later = await launch()
  later.handoff.restoreLaunchAfterReload()
  expect(later.handoff.takeHandedOffNotificationResponse()).toBeNull()
  expect(runtime.storage.size).toBe(0)
})
