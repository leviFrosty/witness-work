import RefreshRuntime from '/@react-refresh'

declare global {
  interface Window {
    $RefreshReg$: () => void
    $RefreshSig$: () => (type: unknown) => unknown
    __vite_plugin_react_preamble_installed__: boolean
  }
}

RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true
await import('./client')
