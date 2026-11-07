import { createFrameController, type MapEngine } from './controller'
import { createMapKitEngine } from './mapkitEngine'

declare const WW_MAPS_APP_ORIGINS: readonly string[]

export function startFrame(
  makeEngine: (element: HTMLElement) => MapEngine,
  allowedOrigins: readonly string[] = WW_MAPS_APP_ORIGINS
) {
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

  document.addEventListener('securitypolicyviolation', () =>
    controller.report('csp')
  )
  return controller
}

if (typeof WW_MAPS_APP_ORIGINS !== 'undefined') startFrame(createMapKitEngine)
