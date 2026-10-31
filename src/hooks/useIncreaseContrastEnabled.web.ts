import useMediaQuery from '@/hooks/useMediaQuery'

/**
 * Whether the browser asks for more contrast (macOS Increase Contrast, a
 * Windows contrast theme), kept current as it's toggled.
 */
export default function useIncreaseContrastEnabled() {
  return useMediaQuery('(prefers-contrast: more)')
}
