// The islands entry on the dev server (pages.tsx): pages aren't served from
// Vite's index.html, so install the React Refresh preamble that
// @vitejs/plugin-react expects, then load the islands.
// @ts-expect-error Vite serves this module; it has no types.
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
