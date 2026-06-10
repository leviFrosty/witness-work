/**
 * Dev-only escape hatch to remount the entire navigation tree (every screen
 * unmounts and mounts fresh) without restarting the JS bundle. App.tsx
 * registers the listener and bumps a `key` on `NavigationContainer`; any screen
 * can call `triggerDevRemount()` — including the one rendering the trigger
 * button, since it remounts along with everything else.
 *
 * Unlike `DevSettings.reload()`, this keeps the Metro connection and any
 * attached React DevTools profiler session alive, so the full initial-mount
 * commit shows up in the profiler.
 */
let listener: (() => void) | null = null

export function setDevRemountListener(fn: (() => void) | null): void {
  listener = fn
}

export function triggerDevRemount(): void {
  listener?.()
}
