import { afterEach, describe, expect, it, vi } from 'vitest'

/** Loads the constants as a build with these inlined variables would. */
async function load(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return {
    apis: (await import('@/constants/apis')).default,
    links: (await import('@/constants/links')).default,
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('hosts by build', () => {
  it('points beta and production at the production hosts', async () => {
    for (const variant of ['production', 'beta', undefined]) {
      const { apis, links } = await load({
        EXPO_PUBLIC_APP_VARIANT: variant,
        EXPO_PUBLIC_API_BASE_URL: undefined,
      })
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
    }
  })

  it('points development builds at the dev API, site and search', async () => {
    const { apis, links } = await load({
      EXPO_PUBLIC_APP_VARIANT: 'development',
      EXPO_PUBLIC_API_BASE_URL: undefined,
    })
    expect(apis.apiHealth).toBe('https://api-dev.witnesswork.app/health')
    expect(links.privacyPolicy).toBe('https://dev.witnesswork.app/privacy')
    expect(links.helpCenterManifest).toBe(
      'https://dev.witnesswork.app/help/bundle/manifest.json'
    )
    expect(links.helpCenterSearch).toBe(
      'https://help-search-dev.witnesswork.app/v1/search'
    )
  })

  it('lets EXPO_PUBLIC_API_BASE_URL override the API in any build', async () => {
    for (const variant of ['development', 'production']) {
      const { apis } = await load({
        EXPO_PUBLIC_APP_VARIANT: variant,
        EXPO_PUBLIC_API_BASE_URL: 'http://localhost:8787',
      })
      expect(apis.apiHealth).toBe('http://localhost:8787/health')
    }
  })
})

describe('support email', () => {
  it('is on the app domain', async () => {
    const { email } = await import('@/constants/contactInformation')
    expect(email).toBe('support@witnesswork.app')
  })
})
