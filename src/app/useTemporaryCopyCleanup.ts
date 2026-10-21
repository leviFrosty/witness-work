import { useEffect } from 'react'
import { deleteTemporaryCopies } from '@/lib/temporaryCopies'

/**
 * Clears the last session's exported files and photo working copies once the
 * app is idle after launch; by then no share sheet or picker can still need
 * them.
 */
export function useTemporaryCopyCleanup(ready: boolean | undefined) {
  useEffect(() => {
    if (ready) void deleteTemporaryCopies()
  }, [ready])
}
