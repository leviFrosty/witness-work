import { readFileSync, globSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('expo', () => ({
  PermissionStatus: {
    DENIED: 'denied',
    GRANTED: 'granted',
    UNDETERMINED: 'undetermined',
  },
}))

const root = path.resolve(__dirname, '../../..')

/** Every `Notifications.<name>` value the app reads, outside tests. */
function namesTheAppUses() {
  const names = new Set<string>()
  const files = globSync('{src,modules}/**/*.{ts,tsx}', {
    cwd: root,
    exclude: (file) => /node_modules|\.test\.|vendor[\\/]web/.test(file),
  })
  for (const file of files) {
    const source = readFileSync(path.join(root, file), 'utf8')
    if (!source.includes("from 'expo-notifications'")) continue
    // Functions, constants, and enums read through a member.
    for (const [, name] of source.matchAll(
      /\bNotifications\.([a-z]\w*|[A-Z][A-Z_]+\b|[A-Z]\w*(?=\.))/g
    ))
      names.add(name)
  }
  return names
}

describe('web notifications facade', () => {
  it('covers every notifications API the app calls', async () => {
    const facade = await import('@/vendor/web/notifications')
    const names = namesTheAppUses()
    expect(names.size).toBeGreaterThan(10)
    for (const name of names) expect(facade).toHaveProperty(name)
  })

  it('never grants permission, schedules or delivers anything', async () => {
    const Notifications = await import('@/vendor/web/notifications')
    await expect(Notifications.getPermissionsAsync()).resolves.toMatchObject({
      granted: false,
      canAskAgain: false,
    })
    await expect(
      Notifications.requestPermissionsAsync()
    ).resolves.toMatchObject({ granted: false })
    await expect(
      Notifications.getAllScheduledNotificationsAsync()
    ).resolves.toEqual([])
    expect(Notifications.getLastNotificationResponse()).toBeNull()
    await expect(Notifications.getDevicePushTokenAsync()).rejects.toThrow()
  })
})
