import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/files/download', () => ({ downloadBlob: vi.fn() }))

const { clearPrintedRecoveryKey, printRecoveryKey } = await import(
  '@/app/web-sign-in/recoveryKeyExport'
)

type FakeElement = {
  id: string
  textContent: string
  className: string
  children: FakeElement[]
  setAttribute: () => void
  append: (...children: FakeElement[]) => void
  remove: () => void
}

/** A page with only what printing touches. */
function page() {
  const body: FakeElement[] = []
  const listeners = new Map<string, Set<() => void>>()
  const element = (): FakeElement => {
    const made: FakeElement = {
      id: '',
      textContent: '',
      className: '',
      children: [],
      setAttribute: () => undefined,
      append: (...children) => made.children.push(...children),
      remove: () => {
        const at = body.indexOf(made)
        if (at >= 0) body.splice(at, 1)
      },
    }
    return made
  }
  const fire = (type: string) => {
    for (const listener of [...(listeners.get(type) ?? [])]) listener()
  }
  const print = vi.fn()
  vi.stubGlobal('document', {
    createElement: element,
    body: { appendChild: (child: FakeElement) => body.push(child) },
    getElementById: (id: string) => body.find((child) => child.id === id),
  })
  vi.stubGlobal('window', {
    addEventListener: (type: string, listener: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(listener)
    },
    removeEventListener: (type: string, listener: () => void) =>
      listeners.get(type)?.delete(listener),
    print,
  })
  const printed = () =>
    body.some((child) =>
      child.children.some((part) => part.textContent === 'KEY-1234')
    )
  return { body, fire, print, printed }
}

describe('printing the recovery key', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    clearPrintedRecoveryKey()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('puts the key in the page only while the dialog is open', () => {
    const { print, printed } = page()
    print.mockImplementation(() => expect(printed()).toBe(true))
    printRecoveryKey('KEY-1234')
    expect(print).toHaveBeenCalledOnce()
    // `print()` returned: the dialog closed.
    expect(printed()).toBe(false)
  })

  it('waits for afterprint when the dialog outlives print()', () => {
    const { fire, print, printed } = page()
    print.mockImplementation(() => fire('beforeprint'))
    printRecoveryKey('KEY-1234')
    expect(printed()).toBe(true)
    fire('afterprint')
    expect(printed()).toBe(false)
  })

  it('removes it after a minute when afterprint never comes', () => {
    const { fire, print, printed } = page()
    print.mockImplementation(() => fire('beforeprint'))
    printRecoveryKey('KEY-1234')
    vi.advanceTimersByTime(60_000)
    expect(printed()).toBe(false)
  })

  it('removes it when the gate goes', () => {
    const { fire, print, printed } = page()
    print.mockImplementation(() => fire('beforeprint'))
    printRecoveryKey('KEY-1234')
    clearPrintedRecoveryKey()
    expect(printed()).toBe(false)
  })

  it('removes it even when print() throws', () => {
    const { print, printed } = page()
    print.mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => printRecoveryKey('KEY-1234')).toThrow('blocked')
    expect(printed()).toBe(false)
  })
})
