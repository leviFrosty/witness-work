import { useEffect, useState } from 'react'

/**
 * How many of a long list's `total` items to draw: `first` with the screen,
 * then `batch` more each frame until all are drawn, so a screen with hundreds
 * of rich rows opens without waiting for every one. Never fewer than `atLeast`,
 * for an item the screen has to show at once (a deep link's).
 */
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
