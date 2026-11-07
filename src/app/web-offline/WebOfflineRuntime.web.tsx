import { useEffect } from 'react'
import { AppState } from 'react-native'
import { analytics } from '@/lib/analytics'
import { addWindowFocusListener } from '@/lib/appLifecycle'
import { logger } from '@/lib/logger'
import i18n from '@/lib/locales'
import { workerScriptURL } from '@/vendor/web/trustedTypes'
import {
  createUpdateChecks,
  registerWorker,
} from '@/lib/webOffline/serviceWorkerClient'
import { createUpdateController } from '@/lib/webOffline/updateFlow'
import { toast } from '@/stores/toasts'

const PROMPT_MS = 20_000
const CHUNK_PATH = '/_expo/static/js/web/'

function keepLoadedChunks() {
  for (const entry of performance.getEntriesByType('resource')) {
    const url = new URL(entry.name, location.href)
    if (url.origin === location.origin && url.pathname.startsWith(CHUNK_PATH))
      fetch(url.href).catch(() => undefined)
  }
}

function ServiceWorkerUpdates() {
  useEffect(() => {
    if (__DEV__ || !('serviceWorker' in navigator)) return
    let worker: Awaited<ReturnType<typeof registerWorker>> | null = null
    let kept = false
    const keep = () => {
      if (kept || !navigator.serviceWorker.controller) return
      kept = true
      keepLoadedChunks()
    }
    const controller = createUpdateController({
      skipWaiting: () => worker?.skip() ?? false,
      showPrompt: ({ accept, close }) => {
        analytics.capture('web_update_prompted')
        const id = toast.info(i18n.t('webUpdate_title'), {
          message: i18n.t('webUpdate_message'),
          action: {
            label: i18n.t('webUpdate_reload'),
            onPress: () => {
              analytics.capture('web_update_accepted')
              accept()
            },
          },
          durationMs: PROMPT_MS,
          key: 'webUpdate',
          onClose: close,
        })
        return () => toast.dismiss(id)
      },
      reload: () => window.location.reload(),
      isVisible: () => document.visibilityState === 'visible',
      setTimeout: (run, ms) => setTimeout(run, ms),
      clearTimeout: (timer) => clearTimeout(timer as number),
    })
    const checks = createUpdateChecks(() => void worker?.check(), Date.now)

    const returned = () => {
      checks.due()
      controller.returned()
    }
    registerWorker(navigator.serviceWorker, workerScriptURL(), {
      onWaiting: controller.workerWaiting,
      onControllerChange: () => {
        controller.controllerChanged()
        keep()
      },
      onControlled: keep,
    })
      .then((registered) => {
        worker = registered
      })
      .catch((error) => logger.warn('[webOffline] no service worker', error))
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') returned()
      else controller.hidden()
    })
    const focus = addWindowFocusListener(returned)

    const periodic = setInterval(checks.due, 60_000)
    return () => {
      appState.remove()
      focus.remove()
      clearInterval(periodic)
    }
  }, [])
  return null
}

export default function WebOfflineRuntime() {
  return <ServiceWorkerUpdates />
}
