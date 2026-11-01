import { create } from 'zustand'
import { analytics } from '@/lib/analytics'
import { errorTracking } from '@/lib/errorTracking'
import { logger } from '@/lib/logger'
import { readSnapshot } from '@/features/updates/lib/helpCenter/snapshot'
import { readCachedBundle } from '@/features/updates/lib/helpCenter/storage'
import { refreshHelpBundle } from '@/features/updates/lib/helpCenter/refresh'
import type {
  HelpBundle,
  HelpLocale,
} from '@/features/updates/types/helpCenter'

export type HelpBundleSource = 'snapshot' | 'cache' | 'network'

type HelpCenterStore = {
  locale: HelpLocale | null
  bundle: HelpBundle | null
  source: HelpBundleSource | null

  open: (locale: HelpLocale) => void
}

const inFlight = new Map<HelpLocale, Promise<void>>()

const isNewer = (a: HelpBundle, b: HelpBundle | null) =>
  !b || a.generatedAt > b.generatedAt

async function newestLocal(locale: HelpLocale): Promise<HelpBundle> {
  const snapshot = readSnapshot(locale)
  const cached = await readCachedBundle(locale)
  return cached && isNewer(cached, snapshot) ? cached : snapshot
}

export const useHelpCenterStore = create<HelpCenterStore>((set, get) => ({
  locale: null,
  bundle: null,
  source: null,
  open: (locale) => {
    const show = (bundle: HelpBundle, source: HelpBundleSource) => {
      const state = get()
      if (state.locale === locale && state.bundle?.hash !== bundle.hash)
        set({ bundle, source })
    }
    const showNewestLocal = async () => {
      const newest = await newestLocal(locale)
      if (newest.hash !== readSnapshot(locale).hash) show(newest, 'cache')
    }

    if (get().locale !== locale || !get().bundle)
      set({ locale, bundle: readSnapshot(locale), source: 'snapshot' })

    const running = inFlight.get(locale)
    if (running) {
      void running.then(showNewestLocal)
      return
    }
    const run = (async () => {
      const newest = await newestLocal(locale)
      if (newest.hash !== readSnapshot(locale).hash) show(newest, 'cache')

      const result = await refreshHelpBundle(locale, newest.hash)
      const fresh = result.outcome === 'unchanged' ? null : result.bundle
      if (fresh) show(fresh, 'network')
      if (result.outcome === 'failed') {
        if (result.reason === 'invalid' || result.reason === 'storage')
          errorTracking.captureException(
            result.error ?? new Error(`Help Center refresh: ${result.reason}`)
          )
        else logger.debug('[HelpCenter] Refresh skipped', result.reason)
      }
      analytics.capture('help_center_refreshed', {
        outcome: result.outcome,
        reason: result.outcome === 'failed' ? result.reason : undefined,
      })
    })().finally(() => inFlight.delete(locale))
    inFlight.set(locale, run)
  },
}))
