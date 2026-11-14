export type SiteEnv = 'production' | 'beta'

export type SiteConfig = {
  env: SiteEnv

  origin: string

  helpSearchOrigin: string

  indexable: boolean
}

const CONFIGS: Record<SiteEnv, SiteConfig> = {
  production: {
    env: 'production',
    origin: 'https://witnesswork.app',
    helpSearchOrigin: 'https://help-search.witnesswork.app',
    indexable: true,
  },
  beta: {
    env: 'beta',
    origin: 'https://beta.witnesswork.app',
    helpSearchOrigin: 'https://help-search-beta.witnesswork.app',
    indexable: false,
  },
}

export function siteConfig(env: string | undefined): SiteConfig {
  const config = CONFIGS[(env || 'production') as SiteEnv]
  if (!config) {
    throw new Error(`WW_SITE_ENV must be production or beta, not "${env}"`)
  }
  return config
}

export const buildDir = (config: SiteConfig) => `dist/${config.env}`

export const SITE = siteConfig(process.env.WW_SITE_ENV)
export const SITE_ORIGIN = SITE.origin
