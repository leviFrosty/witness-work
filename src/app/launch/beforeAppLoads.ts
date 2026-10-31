/**
 * Runs `loadApp` once the platform is ready for the app's modules. iOS and
 * Android are ready at once and must register the app synchronously.
 */
export function beforeAppLoads(loadApp: () => void) {
  loadApp()
}
