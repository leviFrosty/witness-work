/** What Tab can land on. */
export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Keeps Tab inside a modal `<dialog>`: from its last control it wraps to the
 * first, and back. A browser's own modal dialog lets Tab out to the browser's
 * toolbar. Call it from the keydown of anything inside the dialog.
 */
export function trapTab(event: {
  key: string
  shiftKey: boolean
  currentTarget: Element
  preventDefault: () => void
}) {
  if (event.key !== 'Tab') return
  const dialog = event.currentTarget.closest('dialog')
  if (!dialog) return
  const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (item) => item.getClientRects().length > 0
  )
  const first = items[0]
  const last = items.at(-1)
  if (!first || !last) return
  const active = document.activeElement
  if (event.shiftKey && (active === first || active === dialog)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}
