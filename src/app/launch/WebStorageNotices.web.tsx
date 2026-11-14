import { useEffect } from 'react'
import { analytics } from '@/lib/analytics'
import { errorTracking } from '@/lib/errorTracking'
import i18n from '@/lib/locales'
import { webStorageBoot } from '@/lib/webStorage/boot'
import type { StoreProblem } from '@/lib/webStorage/storeDatabase'
import { toast } from '@/stores/toasts'

const messages = {
  unavailable: ['webStorage_unavailable', 'webStorage_unavailableMessage'],
  quotaExceeded: ['webStorage_full', 'webStorage_fullMessage'],
  writeFailed: ['webStorage_writeFailed', 'webStorage_writeFailedMessage'],
} as const satisfies Record<StoreProblem, readonly [string, string]>

function notifyStorageProblem(problem: StoreProblem) {
  const [title, message] = messages[problem]

  const show = problem === 'unavailable' ? toast.news : toast.error
  show(i18n.t(title), {
    message: i18n.t(message),
    durationMs: 10_000,
    key: `webStorage:${problem}`,
  })
  void webStorageBoot.storageStatus().then((status) => {
    errorTracking.addBreadcrumb({
      category: 'storage',
      level: 'warning',
      message: `Web storage: ${problem}`,
      data: status,
    })
    analytics.capture('web_storage_failed', {
      reason: problem,
      persisted: status?.persisted ?? false,
    })
  })
}

export default function WebStorageNotices() {
  useEffect(() => {
    const { stores, photos } = webStorageBoot
    for (const problem of [...stores.problems(), ...photos.problems()])
      notifyStorageProblem(problem)
    if (webStorageBoot.launch()?.tookOver) {
      analytics.capture('web_tab_taken_over')
    }
    const offStores = stores.onProblem(notifyStorageProblem)
    const offPhotos = photos.onProblem(notifyStorageProblem)
    return () => {
      offStores()
      offPhotos()
    }
  }, [])
  return null
}
