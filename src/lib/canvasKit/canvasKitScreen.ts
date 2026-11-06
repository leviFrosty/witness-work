import type { ComponentType } from 'react'

/**
 * A screen that draws with Skia, as a navigator's `getComponent`. On the web
 * (`canvasKitScreen.web.ts`) the screen opens once CanvasKit and its chunk have
 * loaded. Here it's the loader itself.
 *
 * Write the loader as `() => require('…').default`: the web build turns it into
 * an `import()` (`babel/web-lazy-imports.js`).
 */
export const canvasKitScreen = <P extends object>(
  load: () => ComponentType<P>
): (() => ComponentType<P>) => load
