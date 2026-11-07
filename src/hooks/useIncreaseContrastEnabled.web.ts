import useMediaQuery from '@/hooks/useMediaQuery'

export default function useIncreaseContrastEnabled() {
  return useMediaQuery('(prefers-contrast: more)')
}
