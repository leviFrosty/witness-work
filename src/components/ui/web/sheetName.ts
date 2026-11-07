import { type RefObject, useEffect } from 'react'

const MAX_LENGTH = 80

const NOT_A_TITLE =
  'button,[role=button],a,input,select,textarea,style,script,[aria-hidden=true]'

const clip = (text: string) =>
  text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1)}…` : text

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

    const observer = new MutationObserver(name)
    observer.observe(dialog, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    return () => observer.disconnect()
  }, [ref, label])
}
