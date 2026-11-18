import { useEffect, useEffectEvent } from 'react'
import { Platform } from 'react-native'

export default function useWebEscape(enabled: boolean, onEscape: () => void) {
  const escape = useEffectEvent(onEscape)

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      if (event.defaultPrevented) return
      const target = event.target as Element | null
      if (
        target?.closest?.(
          'dialog, [role=dialog], [role=menu], input, textarea, [contenteditable]'
        )
      )
        return
      if (document.querySelector('dialog[open]')) return
      escape()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
