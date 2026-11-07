import { toast } from '@/stores/toasts'

type Button = {
  text?: string
  style?: 'default' | 'cancel' | 'destructive'
  onPress?: (value?: string) => void
}

class Alert {
  static alert(title: string, message?: string, buttons?: Button[]): void {
    const cancel = buttons?.find((button) => button.style === 'cancel')
    const actions = (buttons ?? []).filter((button) => button !== cancel)
    if (!actions.length || (actions.length === 1 && !cancel)) {
      toast.error(title, message ? { message } : undefined)
      ;(actions[0] ?? cancel)?.onPress?.()
      return
    }
    const accepted = window.confirm(
      [title, message].filter(Boolean).join('\n\n')
    )
    if (accepted) actions[actions.length - 1].onPress?.()
    else cancel?.onPress?.()
  }
}

export default Alert
