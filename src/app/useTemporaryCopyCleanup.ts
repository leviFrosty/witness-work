import { useEffect } from 'react'
import { deleteTemporaryCopies } from '@/lib/temporaryCopies'

export function useTemporaryCopyCleanup(ready: boolean | undefined) {
  useEffect(() => {
    if (ready) void deleteTemporaryCopies()
  }, [ready])
}
