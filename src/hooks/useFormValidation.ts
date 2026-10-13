import { useEffect, useRef, useState } from 'react'
import { analytics } from '@/lib/analytics'

/** Show current field errors after Submit, and guard every submission path. */
export default function useFormValidation(
  errors: Record<string, boolean>,
  form: string,
  active = true
) {
  const [attempted, setAttempted] = useState(false)
  const reported = useRef(false)
  useEffect(() => {
    if (!active) setAttempted(false)
  }, [active])
  const validate = () => {
    const fields = Object.keys(errors).filter((field) => errors[field])
    if (!fields.length) {
      setAttempted(false)
      return true
    }
    setAttempted(true)
    // Once per mounted form: no values, names, notes, or other private data.
    if (!reported.current) {
      analytics.capture('form_validation_failed', {
        form,
        fields: fields.join(','),
      })
      reported.current = true
    }
    return false
  }
  return {
    validate,
    invalid: (field: string) => attempted && !!errors[field],
  }
}
