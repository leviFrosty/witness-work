import { useEffect, useRef, useState } from 'react'
import type { TerritoryDoor } from '@/features/territories/types/territory'

const FRESH_MS = 6000

export default function useFreshDoors(
  doors: readonly TerritoryDoor[],
  me?: string
): ReadonlySet<string> {
  const seen = useRef<Map<string, number> | null>(null)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    const before = seen.current
    seen.current = new Map(doors.map((door) => [door.id, door.at]))
    if (!before) return
    const arrived = doors
      .filter((door) => door.by !== me && before.get(door.id) !== door.at)
      .map((door) => door.id)
    if (arrived.length === 0) return
    setFresh((current) => new Set([...current, ...arrived]))
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      setFresh((current) => {
        const next = new Set(current)
        arrived.forEach((id) => next.delete(id))
        return next
      })
    }, FRESH_MS)
    timers.current.add(timer)
  }, [doors, me])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  return fresh
}
