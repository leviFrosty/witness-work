import { useRef, type RefObject } from 'react'
import type { ConfettiHandle } from '@/vendor/ConfettiSkia/react/Confetti'
import type { ConfettiConfig } from '@/vendor/ConfettiSkia/core/Config'

export interface UseConfettiResult {
  ref: RefObject<ConfettiHandle | null>
  trigger: (config?: Partial<ConfettiConfig>) => void
  clear: () => void
}

export default function useConfetti(): UseConfettiResult {
  const ref = useRef<ConfettiHandle | null>(null)
  return {
    ref,
    trigger: (config) => ref.current?.trigger(config),
    clear: () => ref.current?.clear(),
  }
}
