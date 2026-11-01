import { useState } from 'react'
import useLocalDay from '@/hooks/useLocalDay'

export default function useToday(): Date {
  const day = useLocalDay()
  const [today, setToday] = useState(() => ({ day, date: new Date() }))
  if (today.day === day) return today.date
  const next = { day, date: new Date() }
  setToday(next)
  return next.date
}
