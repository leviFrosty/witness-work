import {
  type ComponentProps,
  createElement,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useWindowDimensions } from 'react-native'
import { StackActions } from '@react-navigation/native'
import { NativeStackView } from '@react-navigation/native-stack'
import useTheme from '@/contexts/theme'
import useResolvedScheme from '@/components/ui/web/useResolvedScheme'
import { isRtlLayout } from '@/lib/direction'
import { stackLayers, type StackLayer } from '@/app/navigation/stackLayers'
import { StackPanelContext } from '@/components/ui/layout/stackPanel'

type Props = ComponentProps<typeof NativeStackView>
type State = Props['state']
type Route = State['routes'][number]
type Descriptors = Props['descriptors']
type Layer = StackLayer<Route>
type Leaving = Layer & { descriptors: Descriptors }

const PANEL_MIN_WIDTH = 768
const PANEL_MAX_WIDTH = 840
const PANEL_MAX_HEIGHT = 1000
const PANEL_MARGIN = 40

const ENTER_MS = 220
const EXIT_MS = 160
const PUSH_MS = 200
const EASE_OUT = 'cubic-bezier(.2,.9,.3,1)'
const EASE_IN = 'cubic-bezier(.4,0,1,1)'

const reducedMotion = () =>
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches

const signature = (layers: Layer[]) =>
  layers.map((l) => `${l.kind}:${l.routes.map((r) => r.key)}`).join('|')

export default function StackView({
  state,
  navigation,
  descriptors,
  describe,
}: Props) {
  const { width } = useWindowDimensions()
  const panels = width >= PANEL_MIN_WIDTH
  const layers = stackLayers(
    state.routes,
    (route) => descriptors[route.key]?.options.presentation,
    panels
  )

  const current = signature(layers)
  const [tracked, setTracked] = useState({
    signature: current,
    layers,
    descriptors,
  })
  const [leaving, setLeaving] = useState<Leaving[]>([])
  if (tracked.signature !== current) {
    const open = new Set(layers.map((layer) => layer.key))
    const closed = tracked.layers
      .slice(1)
      .filter((layer) => !open.has(layer.key) && layer.kind === 'panel')
      .map((layer) => ({ ...layer, descriptors: tracked.descriptors }))
    setTracked({ signature: current, layers, descriptors })
    setLeaving((list) => [
      ...list.filter((layer) => !open.has(layer.key)),
      ...(reducedMotion() ? [] : closed),
    ])
  }
  useEffect(() => {
    if (!leaving.length) return
    const timer = setTimeout(() => setLeaving([]), EXIT_MS + 40)
    return () => clearTimeout(timer)
  }, [leaving])

  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
  }, [])

  const top = layers.at(-1)!
  const dismiss = (layer: Layer) => {
    if (layer !== top) return
    const options = descriptors[layer.routes.at(-1)!.key]?.options
    if (options?.gestureEnabled === false) return
    navigation.dispatch({
      ...StackActions.pop(layer.routes.length),
      target: state.key,
    })
  }

  const dismissTop = top.kind === 'panel' ? () => dismiss(top) : null
  const dismissRef = useRef(dismissTop)
  useLayoutEffect(() => {
    dismissRef.current = dismissTop
  })
  const panelOnTop = !!dismissTop
  useEffect(() => {
    if (!panelOnTop) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      const target = event.target as Element | null
      if (target?.closest?.('dialog, [role=dialog], [role=menu]')) return
      if (document.querySelector('dialog[open]')) return
      setTimeout(() => {
        if (!event.defaultPrevented) dismissRef.current?.()
      })
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [panelOnTop])

  const render = (
    layer: Layer,
    from: Descriptors,
    isTop: boolean,
    closing: boolean
  ) => (
    <LayerView
      key={layer.key}
      kind={layer.kind}
      visible={layer.visible || closing}
      interactive={isTop && !closing}
      closing={closing}
      animateIn={mounted.current}
      topKey={layer.routes.at(-1)!.key}
      depth={layer.routes.length}
      animation={from[layer.routes.at(-1)!.key]?.options.animation}
      onDismiss={() => dismiss(layer)}
    >
      <StackPanelContext.Provider
        value={layer.kind === 'panel' ? layer.key : null}
      >
        <NativeStackView
          state={{
            ...state,
            routes: layer.routes,
            index: layer.routes.length - 1,
            preloadedRoutes: layer === layers[0] ? state.preloadedRoutes : [],
          }}
          navigation={navigation}
          descriptors={from}
          describe={describe}
        />
      </StackPanelContext.Provider>
    </LayerView>
  )

  return createElement(
    'div',
    { style: { position: 'relative', display: 'flex', flex: 1 } },
    [
      ...layers.map((layer) =>
        render(layer, descriptors, layer === top, false)
      ),
      ...leaving.map((layer) =>
        render(layer, { ...layer.descriptors, ...descriptors }, false, true)
      ),
    ]
  )
}

function LayerView({
  kind,
  visible,
  interactive,
  closing,
  animateIn,
  topKey,
  depth,
  animation,
  onDismiss,
  children,
}: {
  kind: Layer['kind']
  visible: boolean
  interactive: boolean
  closing: boolean
  animateIn: boolean
  topKey: string
  depth: number
  animation: string | undefined
  onDismiss: () => void
  children: ReactNode
}) {
  const theme = useTheme()
  const layer = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const pressedBackdrop = useRef(false)
  const panel = kind === 'panel'
  const still = animation === 'none'
  const opening = useRef({ animateIn, panel, kind, still })

  useLayoutEffect(() => {
    if (layer.current) layer.current.inert = !interactive
  }, [interactive])

  useEffect(() => {
    const { panel, animateIn } = opening.current
    if (!panel || !animateIn) return
    const opener = document.activeElement

    let tries = 0
    const take = () => {
      const box = frame.current
      const active = document.activeElement
      if (!box || box.contains(active) || ++tries > 12) return stop()
      if (active && active !== document.body && !active.closest('[inert]'))
        return
      box.focus({ preventScroll: true })
      stop()
    }
    const timer = setInterval(take, 80)
    const stop = () => clearInterval(timer)
    take()
    return () => {
      stop()
      setTimeout(() => {
        const active = document.activeElement
        const lost = !active || active === document.body || !active.isConnected
        if (lost && opener instanceof HTMLElement && opener.isConnected)
          opener.focus({ preventScroll: true })
      })
    }
  }, [])

  useLayoutEffect(() => {
    const { animateIn, still, kind, panel } = opening.current
    if (!animateIn || still || kind === 'overlay' || reducedMotion()) return
    backdrop.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: ENTER_MS,
      easing: 'ease-out',
    })
    frame.current?.animate(
      [
        {
          opacity: 0,
          transform: panel ? 'translateY(16px)' : 'translateY(8px)',
        },
        { opacity: 1, transform: 'none' },
      ],
      { duration: ENTER_MS, easing: EASE_OUT }
    )
  }, [])

  useLayoutEffect(() => {
    if (!closing || still) return
    const options: KeyframeAnimationOptions = {
      duration: EXIT_MS,
      easing: EASE_IN,
      fill: 'forwards',
    }
    backdrop.current?.animate([{ opacity: 1 }, { opacity: 0 }], options)
    frame.current?.animate(
      [
        { opacity: 1, transform: 'none' },
        {
          opacity: 0,
          transform: panel ? 'translateY(12px)' : 'translateY(8px)',
        },
      ],
      options
    )
  }, [closing, panel, still])

  const pushed = useRef({ topKey, depth })
  useLayoutEffect(() => {
    const before = pushed.current
    pushed.current = { topKey, depth }
    if (before.topKey === topKey || depth <= before.depth) return
    if (still || reducedMotion()) return
    const offset = isRtlLayout() ? -16 : 16
    frame.current?.animate(
      [
        { opacity: 0, transform: `translateX(${offset}px)` },
        { opacity: 1, transform: 'none' },
      ],
      { duration: PUSH_MS, easing: EASE_OUT }
    )
  }, [topKey, depth, still])

  const dark = useResolvedScheme() === 'dark'
  return createElement(
    'div',
    {
      ref: layer,

      'aria-hidden': closing || (visible && !interactive) || undefined,
      'data-stack-layer': kind,
      style: {
        position: 'absolute',
        inset: 0,
        display: visible ? 'flex' : 'none',
        alignItems: 'center',
        justifyContent: 'center',
        padding: panel ? PANEL_MARGIN : 0,
        pointerEvents: closing ? 'none' : undefined,
      },
    },
    panel &&
      createElement('div', {
        ref: backdrop,
        'data-testid': 'stack-panel-backdrop',
        onPointerDown: (event: PointerEvent) => {
          pressedBackdrop.current = event.target === event.currentTarget
        },
        onClick: (event: MouseEvent) => {
          if (pressedBackdrop.current && event.target === event.currentTarget)
            onDismiss()
        },
        style: {
          position: 'absolute',
          inset: 0,
          backgroundColor: dark ? 'rgba(0,0,0,.5)' : 'rgba(0,0,0,.28)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        },
      }),
    createElement(
      'div',
      {
        ref: frame,
        tabIndex: panel ? -1 : undefined,
        'data-submit-scope': panel ? '' : undefined,
        style: panel
          ? {
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              maxWidth: PANEL_MAX_WIDTH,
              height: '100%',
              maxHeight: PANEL_MAX_HEIGHT,
              overflow: 'hidden',
              borderRadius: theme.numbers.borderRadiusLg,
              backgroundColor: theme.colors.background,
              border: `1px solid ${theme.colors.border}`,
              outline: 'none',
              boxShadow: `0 24px 64px ${theme.colors.shadow}${dark ? '99' : '40'}`,
            }
          : {
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
            },
      },
      children
    )
  )
}
