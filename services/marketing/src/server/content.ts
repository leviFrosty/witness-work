import { createServerOnlyFn } from '@tanstack/react-start'
import { loadHelpCenter, type HelpCenter } from '@/lib/help-center/load'

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
