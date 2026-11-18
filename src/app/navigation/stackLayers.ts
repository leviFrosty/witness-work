export type LayerKind = 'screen' | 'panel' | 'overlay'

export type StackLayer<Route extends { key: string }> = {
  key: string
  kind: LayerKind
  routes: Route[]
  visible: boolean
}

const PANELS = new Set(['modal', 'formSheet', 'pageSheet'])
const OVERLAYS = new Set(['transparentModal', 'containedTransparentModal'])

export function stackLayers<Route extends { key: string }>(
  routes: readonly Route[],
  presentationOf: (route: Route) => string | undefined,
  panels: boolean
): StackLayer<Route>[] {
  const layers: Omit<StackLayer<Route>, 'visible'>[] = []
  for (const route of routes) {
    const presentation = presentationOf(route) ?? 'card'
    const last = layers.at(-1)
    const kind: LayerKind | null = OVERLAYS.has(presentation)
      ? 'overlay'
      : PANELS.has(presentation)
        ? panels
          ? 'panel'
          : 'screen'
        : presentation === 'fullScreenModal' || !last || last.kind === 'overlay'
          ? 'screen'
          : null
    if (kind) layers.push({ key: route.key, kind, routes: [route] })
    else last!.routes.push(route)
  }

  let covered = false
  let panelAbove = false
  return layers
    .reverse()
    .map((layer) => {
      const visible = !covered && !(layer.kind === 'panel' && panelAbove)
      if (layer.kind === 'screen') covered = true
      if (layer.kind === 'panel') panelAbove = true
      return { ...layer, visible }
    })
    .reverse()
}
