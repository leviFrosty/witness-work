import useMediaQuery from '@/hooks/useMediaQuery'

/**
 * Whether the browser asks for less transparency (macOS Reduce Transparency),
 * kept current as it's toggled. Browsers without the media query answer false.
 */
export default function useReduceTransparencyEnabled() {
  return useMediaQuery('(prefers-reduced-transparency: reduce)')
}
