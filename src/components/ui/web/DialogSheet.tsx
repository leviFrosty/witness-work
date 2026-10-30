import {
  type SyntheticEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react'
import { useWindowDimensions, View } from 'react-native'
import useTheme from '@/contexts/theme'
import { trapTab } from '@/components/ui/web/focusTrap'
import { useSheetName } from '@/components/ui/web/sheetName'
import type { NativeSheetProps } from '@/components/ui/Sheet.types'
import {
  dialogHeight,
  MAX_HEIGHT_RATIO,
} from '@/components/ui/web/dialogHeight'

const WIDTH = 560
const ENTER_MS = 160
const EXIT_MS = 120

const css = `
dialog[data-ww-sheet]{padding:0;margin:auto;border:0;overflow:hidden;max-width:none;max-height:none;outline:none}
dialog[data-ww-sheet]::backdrop{background:rgba(0,0,0,.4)}
dialog[data-ww-sheet][data-state=open]{animation:ww-sheet-in ${ENTER_MS}ms ease-out}
dialog[data-ww-sheet][data-state=closed]{animation:ww-sheet-out ${EXIT_MS}ms ease-in forwards}
dialog[data-ww-sheet][data-state=open]::backdrop{animation:ww-sheet-fade-in ${ENTER_MS}ms ease-out}
dialog[data-ww-sheet][data-state=closed]::backdrop{animation:ww-sheet-fade-out ${EXIT_MS}ms ease-in forwards}
@keyframes ww-sheet-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
@keyframes ww-sheet-out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(8px) scale(.98)}}
@keyframes ww-sheet-fade-in{from{opacity:0}to{opacity:1}}
@keyframes ww-sheet-fade-out{from{opacity:1}to{opacity:0}}
@media (prefers-reduced-motion:reduce){dialog[data-ww-sheet],dialog[data-ww-sheet]::backdrop{animation-duration:1ms!important}}
`

/**
 * A sheet as a centered modal `<dialog>`, for windows too wide for a bottom
 * sheet. The browser makes the rest of the page inert, traps Tab inside, and
 * gives focus back to what opened it; Escape or a click on the backdrop
 * dismisses it when `dismissible`.
 */
export default function DialogSheet({
  open,
  onDismiss,
  onClosed,
  snapPoints,
  dismissible,
  backgroundColor,
  accessibilityLabel,
  testID,
  children,
}: NativeSheetProps) {
  const theme = useTheme()
  const { height: viewport } = useWindowDimensions()
  const ref = useRef<HTMLDialogElement>(null)
  // Where the press that ended in a click began.
  const pressedBackdrop = useRef(false)
  const [state, setState] = useState<'open' | 'closed'>(
    open ? 'open' : 'closed'
  )
  // Only a change of `open` closes the dialog, whatever `onClosed` is by then.
  const closed = useEffectEvent(onClosed)
  const fixedHeight = dialogHeight(snapPoints, viewport)
  useSheetName(ref, accessibilityLabel)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open) {
      setState('open')
      if (!dialog.open) dialog.showModal()
      return
    }
    setState('closed')
    const timer = setTimeout(() => {
      if (dialog.open) dialog.close()
      closed()
    }, EXIT_MS)
    return () => clearTimeout(timer)
  }, [open])

  const dismiss = () => {
    if (dismissible) onDismiss()
  }

  return (
    <dialog
      ref={ref}
      data-ww-sheet=''
      data-state={state}
      data-testid={testID ?? 'sheet'}
      onCancel={(event: SyntheticEvent) => {
        // Escape asks the browser to close it; the parent decides.
        event.preventDefault()
        dismiss()
      }}
      onKeyDown={(event) => trapTab(event)}
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog itself; one that began
        // inside it (selecting text, then letting go outside) isn't one.
        if (pressedBackdrop.current && event.target === event.currentTarget)
          dismiss()
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        width: `min(${WIDTH}px, calc(100vw - 48px))`,
        height: fixedHeight,
        maxHeight: `${MAX_HEIGHT_RATIO * 100}vh`,
        borderRadius: theme.numbers.borderRadiusLg + 3,
        backgroundColor,
        color: theme.colors.text,
        boxShadow: `0 12px 48px ${theme.colors.shadow}40`,
      }}
    >
      <style href='ww-dialog-sheet' precedence='ww'>
        {css}
      </style>
      <View
        style={{
          flexShrink: 1,
          flexGrow: fixedHeight ? 1 : 0,
          minHeight: 0,
          paddingBottom: 12,
        }}
      >
        {children}
      </View>
    </dialog>
  )
}
