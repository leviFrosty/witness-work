import { canonicalJson } from '@/lib/canonicalJson'
import { useReloadState } from '@/lib/reloadRestore'

const useDraftChanged = (draft: unknown): boolean => {
  const [initial] = useReloadState('draft-changed-baseline', () =>
    canonicalJson(draft)
  )
  return canonicalJson(draft) !== initial
}

export default useDraftChanged
