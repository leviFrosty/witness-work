import Module from 'node:module'
import { createElement, type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

vi.mock('react-native', () => ({ View: 'View' }))
vi.mock('lucide-react-native', () => ({ X: 'XIcon' }))
vi.mock('@/components/ui/Sheet', () => ({
  // Like the real sheet, its content mounts only once it opens.
  default: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? createElement('Sheet', null, children) : null,
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: { text: '#000', textInverse: '#fff', accent: '#00f' },
    fonts: { bold: 'bold', semiBold: 'semiBold' },
    fontSize: () => 18,
    numbers: { borderRadiusSm: 8 },
  }),
}))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/IconButton', () => ({ default: 'IconButton' }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

// ColorPickerSheet `require()`s the picker at render; vi.mock can't see that,
// so stand it in at the loader and note when it loads.
const panelRequest = '@/components/ColorPickerPanel'
const panel = { loaded: false }
const loader = Module as unknown as {
  _load: (request: string, ...rest: unknown[]) => unknown
}
const originalLoad = loader._load
beforeAll(() => {
  loader._load = (request, ...rest) => {
    if (request !== panelRequest)
      return originalLoad.call(loader, request, ...rest)
    panel.loaded = true
    return {
      default: (props: Record<string, unknown>) =>
        createElement('ColorPickerPanel', props),
    }
  }
})
afterAll(() => {
  loader._load = originalLoad
})

import ColorPickerSheet from '@/components/ColorPickerSheet'

let root: ReactTestRenderer
const onClose = vi.fn()
const onChange = vi.fn()

const render = (visible: boolean) =>
  act(() => {
    const element = (
      <ColorPickerSheet
        visible={visible}
        value='#123456'
        onClose={onClose}
        onChange={onChange}
      />
    )
    if (root) root.update(element)
    else root = create(element)
  })

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  panel.loaded = false
})

afterEach(() => {
  act(() => root.unmount())
  root = undefined as never
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('ColorPickerSheet', () => {
  it('loads the picker only once the sheet opens', () => {
    render(false)
    expect(panel.loaded).toBe(false)

    render(true)
    expect(panel.loaded).toBe(true)
    expect(root.root.findByType('ColorPickerPanel' as never).props.value).toBe(
      '#123456'
    )
  })

  it('keeps the picked color on Done', () => {
    render(true)
    act(() =>
      root.root
        .findByType('ColorPickerPanel' as never)
        .props.onComplete('#abcdef')
    )
    act(() => root.root.findByType('Button' as never).props.onPress())
    expect(onChange).toHaveBeenCalledWith('#abcdef')
    expect(onClose).toHaveBeenCalled()
  })
})
