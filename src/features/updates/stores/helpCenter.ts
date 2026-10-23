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
  /** The Help Center locale the screen asked for. */
  locale: HelpLocale | null
  bundle: HelpBundle | null
  source: HelpBundleSource | null
  /**
   * Shows the best Help Center for `locale` at once (the last download, else
   * the bundled snapshot) and then checks the website for a newer one in the
   * background. Call when the Help Center opens.
   */
  open: (locale: HelpLocale) => void
}

// The open/refresh in flight, per locale, so remounts don't repeat it.
const inFlight = new Map<HelpLocale, Promise<void>>()

/** Whether `a` was published after `b` (ISO timestamps compare as text). */
const isNewer = (a: HelpBundle, b: HelpBundle | null) =>
  !b || a.generatedAt > b.generatedAt

/**
 * The newest copy on this device: the last download, unless the app's snapshot
 * is newer (an app update after that download).
 */
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
    // Shows `bundle` if `locale` is still on screen and it's another version.
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
    // Back on a language whose refresh is still running: show what it leaves.
    const running = inFlight.get(locale)
    if (running) {
      void running.then(showNewestLocal)
      return
    }
    const run = (async () => {
      const newest = await newestLocal(locale)
      if (newest.hash !== readSnapshot(locale).hash) show(newest, 'cache')
      // Compared with this language's newest copy, not whatever is on screen.
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
