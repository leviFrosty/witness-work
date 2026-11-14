export function beforeAppLoads(loadApp: () => void) {
  if (__DEV__) require('@/app/dev-harness/networkLog').installNetworkLog()
  loadApp()
}
