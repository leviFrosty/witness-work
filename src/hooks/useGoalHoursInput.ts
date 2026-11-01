import { useEffect, useRef, useState } from 'react'
import { committedGoalHours } from '@/lib/goalHoursInput'
import { formatPlainNumber } from '@/lib/numbers'

export default function useGoalHoursInput({
  hours,
  defaultHours,
  onSave,
}: {
  hours: number

  defaultHours: number
  onSave: (hours: number) => void
}) {
  const [text, setText] = useState(() => formatPlainNumber(hours))

  const unsaved = useRef<string | null>(null)
  const latest = useRef({ hours, defaultHours, onSave })
  useEffect(() => {
    latest.current = { hours, defaultHours, onSave }
  })

  const save = () => {
    const draft = unsaved.current
    if (draft === null) return
    unsaved.current = null
    const current = latest.current
    const next = committedGoalHours(draft, {
      saved: current.hours,
      fallback: current.defaultHours,
    })
    current.onSave(next)
    setText(formatPlainNumber(next))
  }

  useEffect(() => {
    return () => {
      const draft = unsaved.current
      if (draft === null) return
      const current = latest.current
      current.onSave(
        committedGoalHours(draft, {
          saved: current.hours,
          fallback: current.defaultHours,
        })
      )
    }
  }, [])

  return {
    value: text,
    onChangeText: (next: string) => {
      unsaved.current = next
      setText(next)
    },
    onBlur: save,
    onSubmitEditing: save,
  }
}
