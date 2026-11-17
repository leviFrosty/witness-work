import { useEffect, useState } from 'react'

type Viewport = Pick<VisualViewport, 'height' | 'offsetTop' | 'scale'>
export function keyboardOverlap(layoutHeight: number, viewport: Viewport) {
  if (viewport.scale > 1.01) return 0
  const hidden = layoutHeight - (viewport.offsetTop + viewport.height)
  return hidden > 1 ? Math.round(hidden) : 0
}

const measure = () => {
  const viewport = window.visualViewport
  return viewport ? keyboardOverlap(window.innerHeight, viewport) : 0
}

export default function useWebKeyboardInset() {
  const [inset, setInset] = useState(measure)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => setInset(measure())
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    update()
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return inset
}
