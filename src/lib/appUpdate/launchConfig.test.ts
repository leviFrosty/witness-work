import { beforeEach, expect, it, vi } from 'vitest'

const fetchAppConfig = vi.hoisted(() => vi.fn())

vi.mock('@/lib/appUpdate/updateRequired', () => ({ fetchAppConfig }))
vi.mock('@/constants/apis', () => ({
  default: { appConfig: 'https://api.test/app/v1/config' },
}))

beforeEach(() => {
  vi.resetModules()
  fetchAppConfig.mockReset()
})

it('reads the config once per launch, for everyone who asks', async () => {
  fetchAppConfig.mockResolvedValue({ minAppVersion: null, sync: null })
  const { readLaunchAppConfig } = await import('@/lib/appUpdate/launchConfig')
  const [a, b] = await Promise.all([
    readLaunchAppConfig(),
    readLaunchAppConfig(),
  ])
  expect(a).toBe(b)
  await readLaunchAppConfig()
  expect(fetchAppConfig).toHaveBeenCalledTimes(1)
  expect(fetchAppConfig).toHaveBeenCalledWith('https://api.test/app/v1/config')
})

it('forgets a failed read, so the next caller asks again', async () => {
  fetchAppConfig
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ minAppVersion: null, sync: null })
  const { readLaunchAppConfig } = await import('@/lib/appUpdate/launchConfig')
  await expect(readLaunchAppConfig()).rejects.toThrow('offline')
  await expect(readLaunchAppConfig()).resolves.toEqual({
    minAppVersion: null,
    sync: null,
  })
  await readLaunchAppConfig()
  expect(fetchAppConfig).toHaveBeenCalledTimes(2)
})
