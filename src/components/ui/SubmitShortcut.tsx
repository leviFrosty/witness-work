import { useEffect } from 'react'
import { focusedInput } from '@/lib/focusedInput'
import { pressSubmitAction } from '@/lib/submitShortcut'
import * as SystemMenu from '../../../modules/system-menu'

export default function SubmitShortcut() {
  useEffect(() => {
    const subscription = SystemMenu.subscribeToSubmitShortcut(() => {
      pressSubmitAction(!!focusedInput())
    })
    return () => subscription?.remove()
  }, [])
  return null
}
