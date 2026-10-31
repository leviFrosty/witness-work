import { useEffect, useState } from 'react'

const mediaQueryList = (query: string) =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query)
    : null

/**
 * Whether the browser matches a CSS media query, kept current as it changes.
 * Always false outside a browser.
 */
export default function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => mediaQueryList(query)?.matches ?? false
  )

  useEffect(() => {
    const list = mediaQueryList(query)
    if (!list) return
    const update = () => setMatches(list.matches)
    list.addEventListener('change', update)
    return () => list.removeEventListener('change', update)
  }, [query])

  return matches
}
