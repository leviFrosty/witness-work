import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web'

/**
 * Loads what the app's modules need before they load, then runs `loadApp`:
 *
 * - Skia's CanvasKit, since some modules build Skia shaders as they load.
 *   `scripts/web.mjs` serves `canvaskit.wasm` from the web root.
 * - The selected language's translations, which the web downloads
 *   (`translationLoaders.web.ts`), so the first screen is already translated.
 * - Its Help Center snapshot and English's (`snapshots.web.ts`), so the Help
 *   Center opens offline.
 */
export function beforeAppLoads(loadApp: () => void) {
  void LoadSkiaWeb({ locateFile: () => '/canvaskit.wasm' })
    .then(() => require('@/lib/locales').translationsLoaded())
    .then(() => {
      const { _i18n } = require('@/lib/locales')
      const {
        helpLocaleFor,
      } = require('@/features/updates/lib/helpCenter/locale')
      const {
        loadSnapshot,
      } = require('@/features/updates/lib/helpCenter/snapshot')
      // The app starts without them; the Help Center tries again on opening.
      return loadSnapshot(helpLocaleFor(_i18n.locale)).catch(() => {})
    })
    .then(loadApp)
}
