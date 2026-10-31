import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { pickFiles } from './pickFiles'

type Listener = () => void

/** A page with just enough of a DOM to open one file input. */
function stubPage() {
  const inputListeners: Record<string, Listener> = {}
  const windowListeners: Record<string, Listener> = {}
  const input = {
    files: [] as File[],
    style: {},
    setAttribute: vi.fn(),
    addEventListener: (type: string, fn: Listener) => {
      inputListeners[type] = fn
    },
    click: vi.fn(),
    remove: vi.fn(),
  }
  vi.stubGlobal('document', {
    createElement: () => input,
    body: { appendChild: vi.fn() },
  })
  vi.stubGlobal('window', {
    addEventListener: (type: string, fn: Listener) => {
      windowListeners[type] = fn
    },
    removeEventListener: (type: string) => {
      delete windowListeners[type]
    },
  })
  return { input, inputListeners, windowListeners }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('resolves empty on cancel', async () => {
  const page = stubPage()
  const promise = pickFiles({})
  page.inputListeners.cancel()
  await expect(promise).resolves.toEqual([])
  expect(page.input.remove).toHaveBeenCalled()
})

it('resolves empty when the chooser closes without a cancel event', async () => {
  const page = stubPage()
  const promise = pickFiles({ accept: 'image/*' })
  page.windowListeners.focus()
  await vi.advanceTimersByTimeAsync(2000)
  await expect(promise).resolves.toEqual([])
  expect(page.input.remove).toHaveBeenCalled()
})

it('waits for a file that arrives after focus returns', async () => {
  const page = stubPage()
  const file = new File(['x'], 'a.jpg')
  const promise = pickFiles({})
  page.windowListeners.focus()
  page.input.files = [file]
  await vi.advanceTimersByTimeAsync(2000)
  page.inputListeners.change()
  await expect(promise).resolves.toEqual([file])
})
