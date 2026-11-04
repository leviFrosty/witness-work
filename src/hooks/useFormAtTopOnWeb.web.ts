import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import useMediaQuery from '@/hooks/useMediaQuery'

/**
 * Whether a form in a browser starts at the top rather than docked near the
 * thumb. On a phone the fields sit just above the keyboard, where a thumb
 * reaches. A browser with no thumb to be near, a wide window or a narrow one
 * with a mouse, leaves a gap between the title and the fields (about 400 px at
 * phone width), so they start at the top. A touch screen's browser keeps the
 * phone's layout.
 */
export default function useFormAtTopOnWeb() {
  const { isWide } = useAdaptiveLayout()
  // A mouse or trackpad is the primary pointer; a touch screen's isn't.
  const hasMouse = useMediaQuery('(hover: hover) and (pointer: fine)')
  return isWide || hasMouse
}
