import { type RefObject, useEffect } from 'react'

const MAX_LENGTH = 80
/** Text a screen reader reads as something to press, not as the title. */
const NOT_A_TITLE =
  'button,[role=button],a,input,select,textarea,style,script,[aria-hidden=true]'

const clip = (text: string) =>
  text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1)}…` : text

/**
 * What a sheet is about, from what's in it: its first heading, else its first
 * line of text that isn't on a button.
 */
export function sheetNameFrom(root: Element): string | undefined {
  const heading = root
    .querySelector('h1,h2,h3,h4,h5,h6,[role=heading]')
    ?.textContent?.trim()
  if (heading) return clip(heading)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim()
    if (text && !node.parentElement?.closest(NOT_A_TITLE)) return clip(text)
  }
  return undefined
}

/**
 * Names the `<dialog>` that holds `ref` (or is it) for a screen reader: with
 * `label` if there is one, else after the sheet's own content as it appears.
 * Set on the element itself, since the bottom sheet underneath a phone's sheet
 * is another package's and only knows "Bottom sheet".
 */
export function useSheetName(
  ref: RefObject<Element | null>,
  label: string | undefined
) {
  useEffect(() => {
    const node = ref.current
    const dialog = node?.closest('dialog')
    if (!node || !dialog) return
    if (label) {
      dialog.setAttribute('aria-label', label)
      return
    }
    const name = () => {
      const found = sheetNameFrom(dialog)
      if (found) dialog.setAttribute('aria-label', found)
    }
    name()
    // Content can arrive after the sheet opens.
    const observer = new MutationObserver(name)
    observer.observe(dialog, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    return () => observer.disconnect()
  }, [ref, label])
}
