import { createPortal } from 'react-dom'
import useTheme from '@/contexts/theme'

const OWN_FOCUS =
  ':not([data-menu-item]):not([role=menu]):not([role=dialog]):not(dialog)'

export default function WebFocusStyles() {
  const theme = useTheme()
  return createPortal(
    <style data-ww-focus=''>{`:focus-visible${OWN_FOCUS}{outline:2px solid ${theme.colors.text}!important;outline-offset:2px!important}:is(input,textarea):focus-visible{outline-offset:0!important;border-radius:4px}`}</style>,
    document.head
  )
}
