import { createPortal } from 'react-dom'
import useTheme from '@/contexts/theme'

/** Controls that draw their own focus (the highlighted item of a menu). */
const OWN_FOCUS =
  ':not([data-menu-item]):not([role=menu]):not([role=dialog]):not(dialog)'

/**
 * A visible focus ring on whatever the keyboard focuses, drawn in the theme's
 * text color so it has contrast on every surface and in both appearances. It
 * shows only for keyboard focus (`:focus-visible`), never after a click. It's
 * one rule for every control, since each primitive renders its own element and
 * React Native Web turns the browser's own outline off.
 */
export default function WebFocusStyles() {
  const theme = useTheme()
  return createPortal(
    <style data-ww-focus=''>{`:focus-visible${OWN_FOCUS}{outline:2px solid ${theme.colors.text}!important;outline-offset:2px!important}:is(input,textarea):focus-visible{outline-offset:0!important;border-radius:4px}`}</style>,
    document.head
  )
}
