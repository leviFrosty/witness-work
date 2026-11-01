import { useState } from 'react'
import { canonicalJson } from '@/lib/canonicalJson'

const useDraftChanged = (draft: unknown): boolean => {
  const [initial] = useState(() => canonicalJson(draft))
  return canonicalJson(draft) !== initial
}

export default useDraftChanged
