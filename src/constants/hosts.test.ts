import { afterEach, describe, expect, it, vi } from 'vitest'

type Platform = 'ios' | 'android' | 'web'

async function load(
  env: Record<string, string | undefined>,
  platform: Platform = 'ios'
) {
  vi.resetModules()
  vi.doUnmock('@/constants/betaBuildEnvironment')
  if (platform === 'android')
    vi.doMock(
      '@/constants/betaBuildEnvironment',
      () => import('@/constants/betaBuildEnvironment.android')
    )
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return {
    apis: (await import('@/constants/apis')).default,
    links: (await import('@/constants/links')).default,
    build: await import('@/constants/buildVariant'),
  }
}

const loadBuild = (variant: string | undefined, platform?: Platform) =>
  load(
    { EXPO_PUBLIC_APP_VARIANT: variant, EXPO_PUBLIC_API_BASE_URL: undefined },
    platform
  )

afterEach(() => {
  vi.unstubAllEnvs()
  vi.doUnmock('@/constants/betaBuildEnvironment')
})

type Hosts = Awaited<ReturnType<typeof load>>

const expectProductionHosts = ({ apis, links }: Hosts) => {
  expect(apis.apiHealth).toBe('https://api.witnesswork.app/health')
  expect(apis.accounts).toBe('https://api.witnesswork.app')
  expect(links.privacyPolicy).toBe('https://witnesswork.app/privacy')
  expect(links.termsOfUse).toBe('https://witnesswork.app/terms')
  expect(links.helpCenterSite).toBe('https://witnesswork.app')
  expect(links.helpCenterManifest).toBe(
    'https://witnesswork.app/help/bundle/manifest.json'
  )
  expect(links.helpCenterSearch).toBe(
    'https://help-search.witnesswork.app/v1/search'
  )
  expect(links.mapsFrame).toBe('https://maps.witnesswork.app')
  expect(links.turnstileFrame).toBe('https://verify.witnesswork.app')
}

const expectBetaSiteAndFrames = ({ links }: Hosts) => {
  expect(links.privacyPolicy).toBe('https://beta.witnesswork.app/privacy')
  expect(links.termsOfUse).toBe('https://beta.witnesswork.app/terms')
  expect(links.helpCenterSite).toBe('https://beta.witnesswork.app')
  expect(links.helpCenterManifest).toBe(
    'https://beta.witnesswork.app/help/bundle/manifest.json'
  )
  expect(links.helpCenterSearch).toBe(
    'https://help-search-beta.witnesswork.app/v1/search'
  )
  expect(links.mapsFrame).toBe('https://maps-beta.witnesswork.app')
  expect(links.turnstileFrame).toBe('https://verify-beta.witnesswork.app')
}

describe('hosts by build', () => {
  it('points production, and a build that names no variant, at the production hosts', async () => {
    for (const variant of ['production', undefined, 'staging'])
      for (const platform of ['ios', 'android', 'web'] as const) {
        const hosts = await loadBuild(variant, platform)
        expect(hosts.build.BUILD_ENVIRONMENT).toBe('production')
        expect(hosts.build.IS_DEVELOPMENT_BUILD).toBe(false)
        expectProductionHosts(hosts)
      }
  })

  it('points iOS and web beta builds at the Beta hosts', async () => {
    for (const platform of ['ios', 'web'] as const) {
      const hosts = await loadBuild('beta', platform)
      expect(hosts.build.BUILD_ENVIRONMENT).toBe('beta')
      expect(hosts.build.IS_DEVELOPMENT_BUILD).toBe(false)
      expect(hosts.apis.apiHealth).toBe(
        'https://api-beta.witnesswork.app/health'
      )
      expect(hosts.apis.accounts).toBe('https://api-beta.witnesswork.app')
      expectBetaSiteAndFrames(hosts)
    }
  })

  it('keeps an Android beta build, which is the production app, on the production hosts', async () => {
    const hosts = await loadBuild('beta', 'android')
    expect(hosts.build.BUILD_ENVIRONMENT).toBe('production')
    expectProductionHosts(hosts)
  })

  it('points development builds at a local API, and at Beta’s site, search and frames', async () => {
    for (const platform of ['ios', 'android', 'web'] as const) {
      const hosts = await loadBuild('development', platform)
      expect(hosts.build.BUILD_ENVIRONMENT).toBe('development')
      expect(hosts.build.IS_DEVELOPMENT_BUILD).toBe(true)
      expect(hosts.apis.apiHealth).toBe('http://localhost:8787/health')
      expect(hosts.apis.accounts).toBe('http://localhost:8787')
      expectBetaSiteAndFrames(hosts)
    }
  })

  it('lets EXPO_PUBLIC_API_BASE_URL override the API in any build', async () => {
    for (const variant of ['development', 'beta', 'production']) {
      const { apis } = await load({
        EXPO_PUBLIC_APP_VARIANT: variant,
        EXPO_PUBLIC_API_BASE_URL: 'http://127.0.0.1:8791',
      })
      expect(apis.apiHealth).toBe('http://127.0.0.1:8791/health')
    }
  })

  it('chooses one value per environment', async () => {
    const values = { development: 'd', beta: 'b', production: 'p' }
    expect((await loadBuild('development')).build.forBuild(values)).toBe('d')
    expect((await loadBuild('beta')).build.forBuild(values)).toBe('b')
    expect((await loadBuild('beta', 'android')).build.forBuild(values)).toBe(
      'p'
    )
    expect((await loadBuild('production')).build.forBuild(values)).toBe('p')
  })
})

describe('each web profile', () => {
  it('calls its own API, Help Center and frames, so its CSP allows them', async () => {
    const profiles = (await import('../../config/web-environments.json'))
      .default
    expect(Object.keys(profiles)).toEqual(['local', 'beta', 'production'])
    for (const profile of Object.values(profiles)) {
      const { apis, links } = await loadBuild(profile.variant, 'web')
      expect(apis.accounts).toBe(profile.apiOrigin)
      expect(links.helpCenterManifest).toBe(profile.helpManifest)
      expect(links.helpCenterSearch).toBe(
        `${profile.helpSearchOrigin}/v1/search`
      )
      expect(links.mapsFrame).toBe(profile.mapsOrigin)
      expect(links.turnstileFrame).toBe(profile.verifyOrigin)
    }
  })
})

describe('support email', () => {
  it('is on the app domain', async () => {
    const { email } = await import('@/constants/contactInformation')
    expect(email).toBe('support@witnesswork.app')
  })
})
