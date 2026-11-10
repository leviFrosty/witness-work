import {
  decideSubmit,
  type SubmitDecision,
  type SubmitFocus,
} from '@/lib/submitShortcut'

const BUTTON = '[data-submit-shortcut]'
const OWNER = '[data-submit-owner], [role=menu]'
const SCOPE = 'dialog, [role=dialog], [data-submit-scope]'
const LAYER = 'dialog, [role=dialog]'
const HEADER_BUTTON = '[data-submit-header] [data-submit-shortcut]'
const NOT_TEXT = ['button', 'submit', 'reset', 'image', 'file', 'hidden']
  .map((type) => `:not([type=${type}])`)
  .join('')
const TOGGLE = ['checkbox', 'radio', 'range', 'color']
const FIELD = `input${NOT_TEXT}${TOGGLE.map((type) => `:not([type=${type}])`).join('')}, textarea, [contenteditable]:not([contenteditable=false])`

const shown = (element: Element) =>
  !element.closest('[aria-hidden=true], [inert]') &&
  (typeof element.checkVisibility === 'function'
    ? element.checkVisibility({ visibilityProperty: true })
    : element.getClientRects().length > 0)

const disabled = (element: Element) =>
  element.getAttribute('aria-disabled') === 'true' ||
  element.hasAttribute('disabled')

function focusKind(element: Element | null): SubmitFocus {
  if (!element || element === element.ownerDocument.body) return 'none'
  if (element === element.ownerDocument.documentElement) return 'none'
  if (element.closest(OWNER)) return 'owner'
  if (!element.matches(FIELD)) return 'control'
  return element.matches('input') ? 'singleLine' : 'multiline'
}

const openDialog = (document: Document) =>
  [...document.querySelectorAll('dialog[open]')].filter(shown).at(-1) ?? null

export function resolveSubmit(
  target: Element | null,
  document: Document
): SubmitDecision<HTMLElement> {
  const focus = focusKind(target)
  if (focus === 'owner') return { action: 'leave' }
  const from = focus === 'none' ? openDialog(document) : target
  if (!from) return { action: 'leave' }
  const boundary = from.closest(SCOPE)
  const layer = from.closest(LAYER)
  const scope = boundary ?? document.body
  const marked = (root: Element, selector: string) =>
    [...root.querySelectorAll<HTMLElement>(selector)].filter(shown)
  const inScope = marked(scope, BUTTON).filter(
    (button) => button.closest(SCOPE) === boundary
  )
  const buttons =
    inScope.length || boundary === layer
      ? inScope
      : marked(layer ?? document.body, HEADER_BUTTON).filter(
          (button) => button.closest(LAYER) === layer
        )

  let nearest: Element = scope
  const candidates = buttons.map((button) => {
    let distance = 0
    let node: Element = from
    while (!node.contains(button) && node.parentElement) {
      node = node.parentElement
      distance++
    }
    return { target: button, distance, disabled: disabled(button), node }
  })
  const closest = Math.min(...candidates.map((item) => item.distance))
  for (const item of candidates)
    if (item.distance === closest) nearest = item.node

  return decideSubmit({
    focus,
    candidates,
    hasField: marked(nearest, FIELD).some(
      (field) => field.closest(LAYER) === layer
    ),
  })
}
