import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import useMediaQuery from '@/hooks/useMediaQuery'

export default function useFormAtTopOnWeb() {
  const { isWide } = useAdaptiveLayout()

  const hasMouse = useMediaQuery('(hover: hover) and (pointer: fine)')
  return isWide || hasMouse
}
