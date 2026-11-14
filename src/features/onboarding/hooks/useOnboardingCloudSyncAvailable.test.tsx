import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  isSupporter: false,
  transport: true,
  offered: true,
  prefs: {
    iCloudSyncEnabled: false,
    syncProvider: null as 'cloud' | 'platform' | null,
    cloudSyncConfig: { enabled: true, entitlement: 'everyone' } as {
      enabled: boolean
      entitlement: 'supporter' | 'everyone'
    } | null,
    cloudSyncEntitled: null as boolean | null,
    installedBeforeFreeSync: false,
  },
}))

vi.mock('@/hooks/useIsSupporter', () => ({
  default: () => ({ isSupporter: runtime.isSupporter }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: () => runtime.prefs,
}))
vi.mock('@/lib/syncTransport', () => ({
  hasSyncTransport: () => runtime.transport,
}))
vi.mock('@/lib/syncTransport/provider', () => ({
  cloudSyncOffered: () => runtime.offered,
}))

import useOnboardingCloudSyncAvailable from '@/features/onboarding/hooks/useOnboardingCloudSyncAvailable'

let renderer: ReactTestRenderer | undefined

const Probe = ({ reached }: { reached: boolean }) =>
  React.createElement('probe', {
    available: useOnboardingCloudSyncAvailable(reached),
  })

const render = async (reached: boolean) => {
  await act(() => {
    if (renderer) renderer.update(<Probe reached={reached} />)
    else renderer = create(<Probe reached={reached} />)
  })
  const json = renderer?.toJSON()
  return json && !Array.isArray(json) ? json.props.available : undefined
}

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  runtime.isSupporter = false
  runtime.transport = true
  runtime.offered = true
  runtime.prefs = {
    iCloudSyncEnabled: false,
    syncProvider: null,
    cloudSyncConfig: { enabled: true, entitlement: 'everyone' },
    cloudSyncEntitled: null,
    installedBeforeFreeSync: false,
  }
})

describe('useOnboardingCloudSyncAvailable', () => {
  it('shows on a new install where Cloud Sync is free for everyone', async () => {
    expect(await render(false)).toBe(true)
  })

  it('leaves the step out where Cloud Sync will not turn itself on', async () => {
    runtime.prefs.cloudSyncConfig = null
    expect(await render(false)).toBe(false)
    runtime.prefs.cloudSyncConfig = { enabled: true, entitlement: 'supporter' }
    expect(await render(false)).toBe(false)
    runtime.isSupporter = true
    expect(await render(false)).toBe(true)
    runtime.prefs.iCloudSyncEnabled = true
    expect(await render(false)).toBe(false)
  })

  it('leaves out an install from before sync was free, Supporter or not', async () => {
    runtime.prefs.installedBeforeFreeSync = true
    expect(await render(false)).toBe(false)
    runtime.isSupporter = true
    expect(await render(false)).toBe(false)
  })

  it('leaves out the web and a device that chose iCloud or Google Drive', async () => {
    runtime.transport = false
    expect(await render(false)).toBe(false)
    runtime.transport = true
    runtime.prefs.syncProvider = 'platform'
    expect(await render(false)).toBe(false)
  })

  it('holds its answer once the step is reached', async () => {
    expect(await render(true)).toBe(true)
    runtime.prefs.cloudSyncConfig = null
    expect(await render(true)).toBe(true)
  })
})
