export const FOCUS_GUARD_ATTR = 'data-ww-focus-guard'

export const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  'details > summary:first-of-type',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function isVisible(element: HTMLElement): boolean {
  if (element.closest('[inert]')) return false
  const closedDetails = element.closest('details:not([open])')
  if (
    closedDetails &&
    element !== closedDetails.querySelector(':scope > summary')
  ) {
    return false
  }
  if (typeof element.checkVisibility === 'function') {
    return element.checkVisibility({ visibilityProperty: true })
  }
  if (element.getClientRects().length === 0) return false
  const style = getComputedStyle(element)
  return style.visibility !== 'hidden' && style.visibility !== 'collapse'
}

function isTabbable(element: HTMLElement): boolean {
  if (element.hasAttribute(FOCUS_GUARD_ATTR)) return false
  if (element.tabIndex < 0) return false
  return isVisible(element)
}

function isSkippedRadio(
  element: HTMLElement,
  checkedRadios: Map<Element, Set<string>>,
  container: Element
): boolean {
  if (element.tagName !== 'INPUT') return false
  const input = element as HTMLInputElement
  if (input.type !== 'radio' || !input.name || input.checked) return false
  const scope = input.form ?? container
  let names = checkedRadios.get(scope)
  if (!names) {
    names = new Set()
    for (const radio of scope.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]:checked'
    )) {
      if (radio.name) names.add(radio.name)
    }
    checkedRadios.set(scope, names)
  }
  return names.has(input.name)
}

export function getTabbableElements(container: Element): HTMLElement[] {
  const checkedRadios = new Map<Element, Set<string>>()
  const candidates = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)]
  const items: HTMLElement[] = []
  let hasPositiveTabIndex = false
  for (const element of candidates) {
    if (!isTabbable(element)) continue
    if (isSkippedRadio(element, checkedRadios, container)) continue
    if (element.tabIndex > 0) hasPositiveTabIndex = true
    items.push(element)
  }
  if (!hasPositiveTabIndex) return items
  return items
    .map((element, index) => ({ element, index, order: element.tabIndex }))
    .sort((a, b) => {
      if (a.order === b.order) return a.index - b.index
      if (a.order === 0) return 1
      if (b.order === 0) return -1
      return a.order - b.order
    })
    .map((entry) => entry.element)
}

function attemptFocus(element: HTMLElement, options?: FocusOptions): boolean {
  element.focus(options)
  const active = element.ownerDocument.activeElement
  return active === element || (active !== null && element.contains(active))
}

export function focusFirst(
  container: Element,
  fallback?: HTMLElement | null
): boolean {
  for (const item of getTabbableElements(container)) {
    if (attemptFocus(item)) return true
  }
  if (fallback) return attemptFocus(fallback, { preventScroll: true })
  return false
}

export function focusLast(
  container: Element,
  fallback?: HTMLElement | null
): boolean {
  const items = getTabbableElements(container)
  for (let index = items.length - 1; index >= 0; index--) {
    if (attemptFocus(items[index]!)) return true
  }
  if (fallback) return attemptFocus(fallback, { preventScroll: true })
  return false
}

export function redirectFromGuard(
  edge: 'start' | 'end',
  container: Element | null,
  relatedTarget: EventTarget | null,
  fallback?: HTMLElement | null
) {
  if (!container) return
  const cameFromInside =
    relatedTarget !== null &&
    typeof (relatedTarget as Node).nodeType === 'number' &&
    container.contains(relatedTarget as Node)
  if (edge === 'start') {
    if (cameFromInside) focusLast(container, fallback)
    else focusFirst(container, fallback)
  } else {
    if (cameFromInside) focusFirst(container, fallback)
    else focusLast(container, fallback)
  }
}

export function trapTab(
  event: {
    key: string
    shiftKey: boolean
    altKey?: boolean
    ctrlKey?: boolean
    metaKey?: boolean
    defaultPrevented?: boolean
    currentTarget: Element
    preventDefault: () => void
  },
  container?: Element | null
) {
  if (
    event.key !== 'Tab' ||
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  ) {
    return
  }
  const root = container ?? event.currentTarget.closest('dialog')
  if (!root) return
  const items = getTabbableElements(root)
  const first = items[0]
  const last = items.at(-1)
  if (!first || !last) {
    event.preventDefault()
    return
  }
  const active = root.ownerDocument.activeElement
  if (event.shiftKey) {
    if (active === first || active === root || !root.contains(active)) {
      event.preventDefault()
      focusLast(root)
    }
  } else if (active === last || !root.contains(active)) {
    event.preventDefault()
    focusFirst(root)
  }
}
