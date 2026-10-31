/**
 * The web build has no OTA updates: each page load runs the newest deploy (ADR
 * 0037 §4). Same exports as `hotUpdater.ts`, so the update screens and launch
 * code run unchanged and find nothing to install.
 */
export const otaEnabled = false

export const launchRead = Promise.resolve()

export const hotUpdater = {
  getChannel: () => 'web',
  getBundleId: () => 'web',
  reload: () => reloadApp(),
}

export async function preparedUpdateId(): Promise<string | null> {
  return null
}

export async function hasPreparedUpdate() {
  return false
}

export async function checkHotUpdate(): Promise<null> {
  return null
}

export async function reloadApp() {
  window.location.reload()
}
