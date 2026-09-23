import { createElement } from 'react'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  platform: 'android',
  open: vi.fn(),
  picker: vi.fn(() => null),
  presses: [] as Array<() => void>,
}))
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return native.platform
    },
  },
  View: ({ children }: { children: ReactNode }) =>
    createElement('div', null, children),
}))
vi.mock('@react-native-community/datetimepicker', () => ({
  default: native.picker,
  DateTimePickerAndroid: { open: native.open },
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en' }],
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: () => ({ colorScheme: 'dark', timeFormat: '24' }),
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: { card: '#222', text: '#fff' },
    numbers: { borderRadiusSm: 8 },
  }),
}))
vi.mock('@/components/ui/Button', () => ({
  default: ({
    children,
    onPress,
  }: {
    children: ReactNode
    onPress: () => void
  }) => {
    native.presses.push(onPress)
    return createElement('button', null, children)
  },
}))
vi.mock('@/components/ui/MyText', () => ({
  default: ({ children }: { children: ReactNode }) =>
    createElement('span', null, children),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import DateTimePicker from '@/components/ui/DateTimePicker'

const value = new Date(2026, 8, 23, 14, 35)
const mount = (props: Partial<Parameters<typeof DateTimePicker>[0]> = {}) => {
  const onChange = vi.fn()
  renderToStaticMarkup(
    createElement(DateTimePicker, { value, onChange, ...props })
  )
  return onChange
}

describe('platform date/time controls', () => {
  beforeEach(() => {
    native.platform = 'android'
    native.presses = []
    vi.clearAllMocks()
  })

  it('does not open a dialog on mount and lets datetime users reopen either part', () => {
    mount({ iOSMode: 'datetime' })
    expect(native.picker).not.toHaveBeenCalled()
    expect(native.open).not.toHaveBeenCalled()
    expect(native.presses).toHaveLength(2)
    native.presses[0]()
    expect(native.open).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: 'date', value })
    )
    native.presses[1]()
    expect(native.open).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: 'time', is24Hour: true })
    )
  })

  it('keeps the time when changing the date and ignores dismissal', () => {
    const onChange = mount({ iOSMode: 'datetime' })
    native.presses[0]()
    const options = native.open.mock.calls[0][0]
    options.onChange({ type: 'dismissed' }, value)
    expect(onChange).not.toHaveBeenCalled()
    options.onChange({ type: 'set' }, new Date(2026, 9, 2))
    expect(onChange).toHaveBeenCalledWith(
      expect.anything(),
      new Date(2026, 9, 2, 14, 35)
    )
  })

  it('keeps the date when changing the time', () => {
    const onChange = mount({ iOSMode: 'datetime' })
    native.presses[1]()
    native.open.mock.calls[0][0].onChange(
      { type: 'set' },
      new Date(2000, 0, 1, 9, 15)
    )
    expect(onChange).toHaveBeenCalledWith(
      expect.anything(),
      new Date(2026, 8, 23, 9, 15)
    )
  })

  it('passes date limits and clamps time changes to datetime limits', () => {
    const maximumDate = new Date(2026, 8, 23, 15)
    const minimumDate = new Date(2026, 8, 22)
    const onChange = mount({ iOSMode: 'datetime', minimumDate, maximumDate })
    native.presses[0]()
    expect(native.open).toHaveBeenLastCalledWith(
      expect.objectContaining({ minimumDate, maximumDate })
    )
    native.presses[1]()
    native.open.mock.calls[1][0].onChange(
      { type: 'set' },
      new Date(2026, 8, 23, 16)
    )
    expect(onChange).toHaveBeenCalledWith(expect.anything(), maximumDate)
  })

  it('retains the native iOS picker', () => {
    native.platform = 'ios'
    mount({ iOSMode: 'datetime' })
    expect(native.presses).toHaveLength(0)
    expect(native.picker).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'datetime',
        value,
        themeVariant: 'dark',
      }),
      undefined
    )
  })
})
