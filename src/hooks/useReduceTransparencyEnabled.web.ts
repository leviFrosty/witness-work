import useMediaQuery from '@/hooks/useMediaQuery'

export default function useReduceTransparencyEnabled() {
  return useMediaQuery('(prefers-reduced-transparency: reduce)')
}
