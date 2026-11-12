import { registerRootComponent } from 'expo'
import { isGuestPagePath } from '@/features/territories/guest/launch'
import type { WebTabMessage } from '@/lib/serverAccount/webTabs'
import { startInstallPromptCapture } from '@/lib/webInstall/installPrompt'
import { webLinks } from '@/lib/webLinks/webLinks'
import { webStorageBoot } from '@/lib/webStorage/boot'

export function beforeAppLoads(loadApp: () => void) {
  if (isGuestPagePath(window.location.pathname)) {
    registerRootComponent(
      require('@/app/territory-guest/TerritoryGuestRoot').default
    )
    return
  }
  startInstallPromptCapture()
  const storage = webStorageBoot.prepare()

  void storage
    .then(() => require('@/lib/locales').translationsLoaded())
    .then(() => {
      const { _i18n } = require('@/lib/locales')
      const {
        helpLocaleFor,
      } = require('@/features/updates/lib/helpCenter/locale')
      const {
        loadSnapshot,
      } = require('@/features/updates/lib/helpCenter/snapshot')

      return loadSnapshot(helpLocaleFor(_i18n.locale)).catch(() => {})
    })
    .then(() => storage)
    .then(async (launch) => {
      await webLinks.start(window, launch)
      return launch
    })
    .then(async ({ activeTab }) => {
      if (__DEV__)
        require('@/app/dev-harness/webSession').installWebSessionHarness()
      if (activeTab) {
        await require('@/lib/serverAccount')
          .webAccount?.start()
          .catch(() => undefined)
        return loadApp()
      }

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
