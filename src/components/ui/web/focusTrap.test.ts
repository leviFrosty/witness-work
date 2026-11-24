import { describe, expect, it } from 'vitest'
import {
  FOCUS_GUARD_ATTR,
  focusFirst,
  focusLast,
  getTabbableElements,
  redirectFromGuard,
  trapTab,
} from '@/components/ui/web/focusTrap'

type MockEl = {
  nodeType: number
  tagName: string
  tabIndex: number
  type?: string
  name?: string
  checked?: boolean
  form?: MockEl | null
  visible: boolean
  inert: boolean
  closedDetails: boolean
  isGuard: boolean
  focusable: boolean
  children: MockEl[]
  ownerDocument: { activeElement: MockEl | null }
  hasAttribute: (attr: string) => boolean
  closest: (selector: string) => MockEl | null
  checkVisibility: () => boolean
  getClientRects: () => unknown[]
  focus: () => void
  contains: (node: unknown) => boolean
  querySelectorAll: (selector: string) => MockEl[]
  querySelector: (selector: string) => MockEl | null
}

function makeDoc() {
  const doc: { activeElement: MockEl | null } = { activeElement: null }
  const makeEl = (
    tagName: string,
    opts: Partial<{
      tabIndex: number
      type: string
      name: string
      checked: boolean
      visible: boolean
      inert: boolean
      closedDetails: boolean
      isGuard: boolean
      focusable: boolean
      children: MockEl[]
    }> = {}
  ): MockEl => {
    const el: MockEl = {
      nodeType: 1,
      tagName,
      tabIndex: opts.tabIndex ?? 0,
      type: opts.type,
      name: opts.name,
      checked: opts.checked,
      form: null,
      visible: opts.visible ?? true,
      inert: opts.inert ?? false,
      closedDetails: opts.closedDetails ?? false,
      isGuard: opts.isGuard ?? false,
      focusable: opts.focusable ?? true,
      children: opts.children ?? [],
      ownerDocument: doc,
      hasAttribute: (attr) => attr === FOCUS_GUARD_ATTR && el.isGuard,
      closest: (selector) => {
        if (selector === '[inert]') return el.inert ? el : null
        if (selector === 'details:not([open])')
          return el.closedDetails ? el : null
        if (selector === 'dialog') return el.tagName === 'DIALOG' ? el : null
        return null
      },
      checkVisibility: () => el.visible,
      getClientRects: () => (el.visible ? [{}] : []),
      focus: () => {
        if (el.focusable && el.visible && !el.inert) {
          doc.activeElement = el
        }
      },
      contains: (node) =>
        node === el || el.children.some((child) => child.contains(node)),
      querySelectorAll: (selector) => {
        if (selector === 'input[type="radio"]:checked') {
          return el.children.filter(
            (child) =>
              child.tagName === 'INPUT' &&
              child.type === 'radio' &&
              child.checked
          )
        }
        return el.children
      },
      querySelector: () => null,
    }
    return el
  }
  return { doc, makeEl }
}

describe('focusTrap', () => {
  it('filters guards, negative tabIndex, hidden, inert, and closed details elements', () => {
    const { makeEl } = makeDoc()
    const first = makeEl('BUTTON')
    const guard = makeEl('SPAN', { isGuard: true })
    const negative = makeEl('DIV', { tabIndex: -1 })
    const hidden = makeEl('BUTTON', { visible: false })
    const inert = makeEl('INPUT', { inert: true })
    const closed = makeEl('A', { closedDetails: true })
    const last = makeEl('INPUT')
    const container = makeEl('DIV', {
      children: [guard, first, negative, hidden, inert, closed, last],
    })

    const items = getTabbableElements(container as unknown as Element)
    expect(items).toEqual([first, last])
  })

  it('orders positive tabIndex elements before tabIndex 0 in stable order', () => {
    const { makeEl } = makeDoc()
    const zeroA = makeEl('BUTTON', { tabIndex: 0 })
    const two = makeEl('BUTTON', { tabIndex: 2 })
    const oneA = makeEl('BUTTON', { tabIndex: 1 })
    const oneB = makeEl('BUTTON', { tabIndex: 1 })
    const zeroB = makeEl('BUTTON', { tabIndex: 0 })
    const container = makeEl('DIV', {
      children: [zeroA, two, oneA, oneB, zeroB],
    })

    expect(getTabbableElements(container as unknown as Element)).toEqual([
      oneA,
      oneB,
      two,
      zeroA,
      zeroB,
    ])
  })

  it('focusFirst and focusLast skip elements that refuse focus and fall back to container', () => {
    const { doc, makeEl } = makeDoc()
    const brokenFirst = makeEl('BUTTON', { focusable: false })
    const middle = makeEl('INPUT')
    const brokenLast = makeEl('BUTTON', { focusable: false })
    const fallback = makeEl('DIV', { tabIndex: -1 })
    const container = makeEl('DIV', {
      children: [brokenFirst, middle, brokenLast],
    })

    expect(
      focusFirst(
        container as unknown as Element,
        fallback as unknown as HTMLElement
      )
    ).toBe(true)
    expect(doc.activeElement).toBe(middle)

    doc.activeElement = null
    expect(
      focusLast(
        container as unknown as Element,
        fallback as unknown as HTMLElement
      )
    ).toBe(true)
    expect(doc.activeElement).toBe(middle)

    const empty = makeEl('DIV', { children: [] })
    expect(
      focusFirst(
        empty as unknown as Element,
        fallback as unknown as HTMLElement
      )
    ).toBe(true)
    expect(doc.activeElement).toBe(fallback)
  })

  it('skips unchecked radios in a group that already has a checked radio', () => {
    const { makeEl } = makeDoc()
    const radioA = makeEl('INPUT', {
      type: 'radio',
      name: 'choice',
      checked: true,
    })
    const radioB = makeEl('INPUT', {
      type: 'radio',
      name: 'choice',
      checked: false,
    })
    const radioUncheckedGroup = makeEl('INPUT', {
      type: 'radio',
      name: 'other',
      checked: false,
    })
    const container = makeEl('DIV', {
      children: [radioA, radioB, radioUncheckedGroup],
    })

    expect(getTabbableElements(container as unknown as Element)).toEqual([
      radioA,
      radioUncheckedGroup,
    ])
  })

  it('redirectFromGuard wraps when coming from inside and enters at the near edge from outside', () => {
    const { doc, makeEl } = makeDoc()
    const first = makeEl('BUTTON')
    const last = makeEl('INPUT')
    const outside = makeEl('BUTTON')
    const container = makeEl('DIV', { children: [first, last] })

    redirectFromGuard(
      'start',
      container as unknown as Element,
      first as unknown as EventTarget
    )
    expect(doc.activeElement).toBe(last)

    redirectFromGuard(
      'end',
      container as unknown as Element,
      last as unknown as EventTarget
    )
    expect(doc.activeElement).toBe(first)

    redirectFromGuard(
      'start',
      container as unknown as Element,
      outside as unknown as EventTarget
    )
    expect(doc.activeElement).toBe(first)

    redirectFromGuard('end', container as unknown as Element, null)
    expect(doc.activeElement).toBe(last)
  })

  it('trapTab wraps Tab at last and Shift+Tab at first or container, and ignores non-Tab or prevented events', () => {
    const { doc, makeEl } = makeDoc()
    const first = makeEl('BUTTON')
    const last = makeEl('INPUT')
    const dialog = makeEl('DIALOG', { children: [first, last] })

    let prevented = false
    doc.activeElement = last
    trapTab(
      {
        key: 'Tab',
        shiftKey: false,
        currentTarget: dialog as unknown as Element,
        preventDefault: () => {
          prevented = true
        },
      },
      dialog as unknown as Element
    )
    expect(prevented).toBe(true)
    expect(doc.activeElement).toBe(first)

    prevented = false
    trapTab(
      {
        key: 'Tab',
        shiftKey: true,
        currentTarget: dialog as unknown as Element,
        preventDefault: () => {
          prevented = true
        },
      },
      dialog as unknown as Element
    )
    expect(prevented).toBe(true)
    expect(doc.activeElement).toBe(last)

    prevented = false
    trapTab(
      {
        key: 'Tab',
        shiftKey: false,
        defaultPrevented: true,
        currentTarget: dialog as unknown as Element,
        preventDefault: () => {
          prevented = true
        },
      },
      dialog as unknown as Element
    )
    expect(prevented).toBe(false)
    expect(doc.activeElement).toBe(last)
  })
})
