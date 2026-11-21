import { takeNewestWorker } from '@/lib/webOffline/serviceWorkerClient'

export async function reloadIntoNewestVersion(): Promise<void> {
  const container =
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? navigator.serviceWorker
      : null
  if (container?.controller)
    await takeNewestWorker(container).catch(() => false)
  window.location.reload()
}
