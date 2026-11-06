import type { ComponentType, ReactNode } from 'react'

/**
 * A component that draws with Skia, required the first time it renders. On the
 * web (`canvasKitComponent.web.tsx`) it waits for CanvasKit and its own chunk,
 * showing `fallback` until then. Skia code reached from anywhere else must go
 * through this or `canvasKitScreen` (`canvasKitBoundaries.test.ts`).
 *
 * Write the loader as `() => require('…').Name`: the web build turns it into an
 * `import()` (`babel/web-lazy-imports.js`).
 */
export function canvasKitComponent<P extends object>(
  load: () => ComponentType<P>,
  // Only the web shows it, while CanvasKit downloads.
  _fallback?: (props: P) => ReactNode
): ComponentType<P> {
  return function CanvasKitComponent(props: P) {
    const Component = load()
    return <Component {...props} />
  }
}
