import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  key: false as boolean | Error,
  cloud: false as boolean | Error,
}))

const answer = (value: boolean | Error) =>
  value instanceof Error ? Promise.reject(value) : Promise.resolve(value)

vi.mock('@/app/sync/iCloudSync', () => ({
  hasRemoteBackup: () => answer(runtime.cloud),
}))
vi.mock('@/lib/serverAccount', () => ({
  hasAccountKey: () => answer(runtime.key),
}))

import { detectRestoreSource } from '@/features/onboarding/lib/restoreSource'

beforeEach(() => {
  runtime.key = false
  runtime.cloud = false
})

describe('detectRestoreSource', () => {
  it('finds nothing on a fresh device', async () => {
    expect(await detectRestoreSource()).toBe(false)
  })

  it('finds an account key brought back from another install', async () => {
    runtime.key = true
    expect(await detectRestoreSource()).toBe(true)
  })

  it("finds another device's sync file", async () => {
    runtime.cloud = true
    expect(await detectRestoreSource()).toBe(true)
  })

  it('counts a check that fails as nothing found', async () => {
    runtime.key = new Error('keychain')
    runtime.cloud = new Error('offline')
    expect(await detectRestoreSource()).toBe(false)
    runtime.cloud = true
    expect(await detectRestoreSource()).toBe(true)
  })
})
