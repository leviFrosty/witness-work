import { useEffect, useState } from 'react'
import { addForegroundListener } from '@/lib/appLifecycle'

const localDay = () => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * Today's local date (`YYYY-MM-DD`), changing at midnight and when the app
 * comes back on a new day. Derive "today" values from it so React Compiler
 * recomputes them then, instead of keeping a `moment()` from an earlier day.
 */
export default function useLocalDay(): string {
  const [day, setDay] = useState(localDay)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const update = () => setDay(localDay())
    const scheduleMidnight = () => {
      const next = new Date()
      next.setHours(24, 0, 1, 0)
      timer = setTimeout(() => {
        update()
        scheduleMidnight()
      }, next.getTime() - Date.now())
    }
    scheduleMidnight()
    const foreground = addForegroundListener(update)
    return () => {
      clearTimeout(timer)
      foreground.remove()
    }
  }, [])

  return day
}
