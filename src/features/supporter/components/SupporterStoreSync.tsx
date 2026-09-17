import { useEffect } from 'react'
import useIsSupporter from '@/hooks/useIsSupporter'
import { useSupporter } from '@/features/supporter/stores/supporter'

// Mirror context into the store consumed by non-React widget snapshot writers.
export default function SupporterStoreSync() {
  const { isSupporter } = useIsSupporter()
  useEffect(() => {
    useSupporter.getState().setSupporter(isSupporter)
  }, [isSupporter])
  return null
}
