/**
 * Build-time configuration by environment. `WW_SITE_ENV` picks it: unset or
 * `production` builds witnesswork.app, `dev` builds the staging site at
 * dev.witnesswork.app, which is never indexed. Vite replaces
 * `process.env.WW_SITE_ENV` in the bundles (vite.config.ts); Node scripts read
 * the real variable.
 */
export type SiteEnv = 'production' | 'dev'

export type SiteConfig = {
  env: SiteEnv
  /** Where the site is served; every absolute URL it writes starts here. */
  origin: string
  /** The help-search Worker (services/help-search). */
  helpSearchOrigin: string
  /** Whether search engines may index the site. */
  indexable: boolean
}

const CONFIGS: Record<SiteEnv, SiteConfig> = {
  production: {
    env: 'production',
    origin: 'https://witnesswork.app',
    helpSearchOrigin: 'https://help-search.witnesswork.app',
    indexable: true,
  },
  dev: {
    env: 'dev',
    origin: 'https://dev.witnesswork.app',
    helpSearchOrigin: 'https://help-search-dev.witnesswork.app',
    indexable: false,
  },
}

export function siteConfig(env: string | undefined): SiteConfig {
  const config = CONFIGS[(env || 'production') as SiteEnv]
  if (!config) {
    throw new Error(`WW_SITE_ENV must be production or dev, not "${env}"`)
  }
  return config
}

/**
 * Each environment builds into its own folder, so a deploy can only upload the
 * build made for it (wrangler.jsonc). The static site is `<dir>/client`.
 */
export const buildDir = (config: SiteConfig) => `dist/${config.env}`

export const SITE = siteConfig(process.env.WW_SITE_ENV)
export const SITE_ORIGIN = SITE.origin
