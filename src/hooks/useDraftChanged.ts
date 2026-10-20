import { useState } from 'react'
import { canonicalJson } from '@/lib/canonicalJson'

/**
 * Whether a form's draft differs from what it opened with. Pass the draft as it
 * would save; the first render's value is the starting point.
 */
const useDraftChanged = (draft: unknown): boolean => {
  const [initial] = useState(() => canonicalJson(draft))
  return canonicalJson(draft) !== initial
}

export default useDraftChanged
