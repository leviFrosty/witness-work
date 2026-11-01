import { useEffect, useState } from 'react'

export default function useProgressiveCount(
  total: number,
  {
    first,
    batch,
    atLeast = 0,
  }: { first: number; batch: number; atLeast?: number }
): number {
  const [drawn, setDrawn] = useState(first)
  const count = Math.min(total, Math.max(drawn, atLeast))
  useEffect(() => {
    if (count >= total) return
    const frame = requestAnimationFrame(() => setDrawn(count + batch))
    return () => cancelAnimationFrame(frame)
  }, [count, total, batch])
  return count
}
