import useMediaQuery from '@/hooks/useMediaQuery'

export default function useHasFinePointer() {
  return useMediaQuery('(hover: hover) and (pointer: fine)')
}
