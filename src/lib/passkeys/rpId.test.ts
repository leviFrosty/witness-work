import { afterEach, describe, expect, it, vi } from 'vitest'

async function rpId(variant: string | undefined, android = false) {
  vi.resetModules()
  vi.doUnmock('@/constants/betaBuildEnvironment')
  if (android)
    vi.doMock(
      '@/constants/betaBuildEnvironment',
      () => import('@/constants/betaBuildEnvironment.android')
    )
  vi.stubEnv('EXPO_PUBLIC_APP_VARIANT', variant)
  return (await import('@/lib/passkeys/rpId')).PASSKEY_RP_ID
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.doUnmock('@/constants/betaBuildEnvironment')
})

describe('the passkey relying party', () => {
  it('is the production web app for production builds', async () => {
    expect(await rpId('production')).toBe('app.witnesswork.app')
    expect(await rpId(undefined)).toBe('app.witnesswork.app')
  })

  it('is the Beta web app for beta builds', async () => {
    expect(await rpId('beta')).toBe('beta.app.witnesswork.app')
  })

  it('stays production for an Android beta build, which is the production app', async () => {
    expect(await rpId('beta', true)).toBe('app.witnesswork.app')
  })

  it('borrows the Beta web app for native development builds', async () => {
    expect(await rpId('development')).toBe('beta.app.witnesswork.app')
    expect(await rpId('development', true)).toBe('beta.app.witnesswork.app')
  })
})
