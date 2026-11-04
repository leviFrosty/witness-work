// The frame page's entry. `scripts/web-maps.mjs` builds it per environment,
// with that environment's app origins in `WW_MAPS_APP_ORIGINS`.
import { createFrameController, type MapEngine } from './controller'
import { createMapKitEngine } from './mapkitEngine'

declare const WW_MAPS_APP_ORIGINS: readonly string[]

/** Starts the frame with `engine`; the test double passes its own. */
export function startFrame(
  makeEngine: (element: HTMLElement) => MapEngine,
  allowedOrigins: readonly string[] = WW_MAPS_APP_ORIGINS
) {
  // Opened on its own, it has no app to answer.
  if (window.parent === window) return
  const element = document.getElementById('map')!
  const controller = createFrameController({
    allowedOrigins,
    parent: window.parent,
    engine: makeEngine(element),
  })
  window.addEventListener('message', (event) =>
    controller.receive({
      origin: event.origin,
      source: event.source,
      data: event.data,
    })
  )
  // MapKit's hosts come from its bootstrap; tell the app when the CSP stops
  // one, without the URL (a tile URL carries coordinates).
  document.addEventListener('securitypolicyviolation', () =>
    controller.report('csp')
  )
  return controller
}

if (typeof WW_MAPS_APP_ORIGINS !== 'undefined') startFrame(createMapKitEngine)
