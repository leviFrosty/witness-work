/**
 * Home Screen widgets are iOS only, so the web keeps nothing in sync, and its
 * entry chunk leaves out the widgets' code, Skia's and the phone number parser
 * they bring (docs/web-performance.md).
 */
export function useWidgetSync(_storageReady: boolean | undefined) {}
