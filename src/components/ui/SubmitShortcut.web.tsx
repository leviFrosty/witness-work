import { useEffect } from 'react'
import { resolveSubmit } from '@/components/ui/web/submitTarget'
import { isApplePlatform, isSubmitShortcut } from '@/lib/submitShortcut'

export default function SubmitShortcut() {
  useEffect(() => {
    const apple = isApplePlatform(navigator.platform)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isSubmitShortcut(event, apple)) return
      const target = event.target instanceof Element ? event.target : null
      const decision = resolveSubmit(target, document)
      if (decision.action === 'leave') return
      event.preventDefault()
      event.stopPropagation()
      if (decision.action === 'swallow') return
      if (decision.action === 'blur') {
        if (target instanceof HTMLElement) target.blur()
        return
      }

      const button = decision.target
      button.focus({ preventScroll: true })
      setTimeout(() => button.click())
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [])
  return null
}
