import { createServerOnlyFn } from '@tanstack/react-start'
import { loadHelpCenter, type HelpCenter } from '@/lib/help-center/load'

/**
 * The Help Center content, read once per build (every request in dev) by the
 * routes' loaders, then read synchronously while their pages render. Pages are
 * only ever rendered at build time (nothing hydrates the router), so the
 * content never travels to the browser as loader data.
 */
let center: Promise<HelpCenter> | undefined
let loaded: HelpCenter | undefined

export const loadContent = createServerOnlyFn(async () => {
  if (import.meta.env.DEV || !center) center = loadHelpCenter()
  loaded = await center
  return loaded
})

export const content = createServerOnlyFn((): HelpCenter => {
  if (!loaded) throw new Error('A route rendered before loading content.')
  return loaded
})
