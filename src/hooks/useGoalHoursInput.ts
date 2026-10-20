import { useEffect, useRef, useState } from 'react'
import { committedGoalHours } from '@/lib/goalHoursInput'
import { formatPlainNumber } from '@/lib/numbers'

/**
 * Text state for a typed monthly goal (hours) that saves itself: on blur, on
 * the keyboard's Done, and when the field unmounts mid-edit (Back, or
 * onboarding's Continue), where `onBlur` doesn't reliably fire.
 */
export default function useGoalHoursInput({
  hours,
  defaultHours,
  onSave,
}: {
  hours: number
  /** What a cleared field saves: the role's default goal. */
  defaultHours: number
  onSave: (hours: number) => void
}) {
  const [text, setText] = useState(() => formatPlainNumber(hours))
  // Typed text not saved yet; null once saved.
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
