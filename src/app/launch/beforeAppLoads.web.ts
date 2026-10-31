import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web'
import { registerRootComponent } from 'expo'
import type { WebTabMessage } from '@/lib/serverAccount/webTabs'
import { webStorageBoot } from '@/lib/webStorage/boot'

/**
 * Loads what the app's modules need before they load, then runs `loadApp`:
 *
 * - The saved stores, from IndexedDB into memory, since the stores and the
 *   language read them synchronously as they load (docs/web-storage.md).
 * - Skia's CanvasKit, since some modules build Skia shaders as they load.
 *   `scripts/web.mjs` serves `canvaskit.wasm` from the web root.
 * - The selected language's translations, which the web downloads
 *   (`translationLoaders.web.ts`), so the first screen is already translated.
 * - Its Help Center snapshot and English's (`snapshots.web.ts`), so the Help
 *   Center opens offline.
 * - The account key and session, sealed in IndexedDB, so the app knows whether
 *   the browser is signed in.
 *
 * While WitnessWork is open in another tab, this tab shows that instead.
 */
export function beforeAppLoads(loadApp: () => void) {
  const storage = webStorageBoot.prepare()
  void Promise.all([
    LoadSkiaWeb({ locateFile: () => '/canvaskit.wasm' }),
    storage,
  ])
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
    .then(() => storage)
    .then(async ({ activeTab }) => {
      // Verification hooks; Metro drops the branch from release bundles.
      if (__DEV__)
        require('@/app/dev-harness/webSession').installWebSessionHarness()
      if (activeTab) {
        await require('@/lib/serverAccount')
          .webAccount?.start()
          .catch(() => undefined)
        return loadApp()
      }
      // Wiped in the active tab: this one's copy is gone too.
      const { reloadPage, sessionTabs } =
        require('@/lib/serverAccount/webTabs') as typeof import('@/lib/serverAccount/webTabs')
      sessionTabs.subscribe((message: WebTabMessage) => {
        if (message.type === 'wiped') reloadPage()
      })
      registerRootComponent(
        require('@/app/launch/OpenInAnotherTabRoot').default
      )
    })
}
