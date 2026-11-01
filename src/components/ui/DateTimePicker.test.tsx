const originalTZ = process.env.TZ
process.env.TZ = 'America/Chicago'

import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const prefs = vi.hoisted(() => ({
  colorScheme: 'dark' as 'dark' | 'light' | undefined,
  timeFormat: '24' as '12' | '24' | undefined,
  formatRegion: undefined as string | undefined,
}))
const app = vi.hoisted(() => ({ locale: 'es-es' }))

vi.mock('react-native', () => ({ View: 'View' }))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
  getCalendars: () => [{ uses24hourClock: false, firstWeekday: 1 }],
}))
vi.mock('@expo/ui', () => ({ Host: 'Host' }))
vi.mock('@expo/ui/swift-ui', () => ({ DatePicker: 'DatePicker' }))
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  datePickerStyle: (style: string) => ({ datePickerStyle: style }),
  tint: (color: string) => ({ tint: color }),
  environment: (key: string, value: string) => ({ [key]: value }),
}))
vi.mock('@expo/ui/jetpack-compose', () => ({
  DatePickerDialog: 'DatePickerDialog',
  TimePickerDialog: 'TimePickerDialog',
}))
vi.mock('@/stores/preferences', () => ({ usePreferences: () => prefs }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: { accent: '#accent', card: '#card' },
    numbers: { borderRadiusSm: 8 },
  }),
}))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
  _i18n: app,
}))

import AndroidPicker from '@/components/ui/DateTimePicker.android'
import IOSPicker from '@/components/ui/DateTimePicker.ios'
import type { DateTimePickerProps } from '@/components/ui/DateTimePicker.types'

const value = new Date(2026, 8, 23, 14, 35)
let tree: ReactTestRenderer

const mount = (
  Picker: typeof AndroidPicker,
  props: Partial<DateTimePickerProps> = {}
) => {
  const onChange = vi.fn()
  act(() => {
    tree = create(<Picker value={value} onChange={onChange} {...props} />)
  })
  return onChange
}
const buttons = () => tree.root.findAllByType('Button' as never)
const press = (index: number) => act(() => buttons()[index].props.onPress())
const dialog = (type: string) => tree.root.findByType(type as never).props
const dialogs = () => [
  ...tree.root.findAllByType('DatePickerDialog' as never),
  ...tree.root.findAllByType('TimePickerDialog' as never),
]

beforeEach(() => {
  prefs.colorScheme = 'dark'
  prefs.timeFormat = '24'
  prefs.formatRegion = undefined
  app.locale = 'es-es'
})
afterEach(() => act(() => tree.unmount()))
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

describe('Android', () => {
  it('shows a button per part and opens no dialog until one is pressed', () => {
    mount(AndroidPicker, { iOSMode: 'datetime' })
    expect(buttons().map((b) => b.props.accessibilityLabel)).toEqual([
      'date',
      'time',
    ])

    expect(buttons().map((b) => b.props.accessibilityValue.text)).toEqual([
      buttons()[0].findByType('Text' as never).props.children,
      buttons()[1].findByType('Text' as never).props.children,
    ])
    expect(buttons()[1].props.accessibilityValue.text).toMatch(/35/)
    expect(dialogs()).toHaveLength(0)

    press(0)
    expect(dialog('DatePickerDialog')).toMatchObject({
      initialDate: '2026-09-23T00:00:00.000Z',
      color: '#accent',
    })
    expect(tree.root.findByType('Host' as never).props).toMatchObject({
      colorScheme: 'dark',
      seedColor: '#accent',
    })
  })

  it('lands a picked day on the local day and keeps the time', () => {
    const onChange = mount(AndroidPicker, { iOSMode: 'datetime' })
    press(0)

    act(() =>
      dialog('DatePickerDialog').onDateSelected(new Date(Date.UTC(2026, 9, 2)))
    )
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'set' }),
      new Date(2026, 9, 2, 14, 35)
    )
    expect(dialogs()).toHaveLength(0)
  })

  it('keeps the day when picking a time, in the 12/24-hour preference', () => {
    const onChange = mount(AndroidPicker, { iOSMode: 'datetime' })
    press(1)
    expect(dialog('TimePickerDialog')).toMatchObject({
      initialDate: value.toISOString(),
      is24Hour: true,
    })
    act(() =>
      dialog('TimePickerDialog').onDateSelected(new Date(2026, 8, 23, 9, 15))
    )
    expect(onChange).toHaveBeenCalledWith(
      expect.anything(),
      new Date(2026, 8, 23, 9, 15)
    )

    prefs.timeFormat = '12'
    press(1)
    expect(dialog('TimePickerDialog').is24Hour).toBe(false)
  })

  it('greys out days past the limits and clamps times to them', () => {
    const maximumDate = new Date(2026, 8, 23, 15)
    const minimumDate = new Date(2026, 8, 22)
    const onChange = mount(AndroidPicker, {
      iOSMode: 'datetime',
      minimumDate,
      maximumDate,
    })
    press(0)
    expect(dialog('DatePickerDialog').selectableDates).toEqual({
      start: minimumDate,
      end: maximumDate,
    })
    act(() => dialog('DatePickerDialog').onDismissRequest())
    expect(dialogs()).toHaveLength(0)
    expect(onChange).not.toHaveBeenCalled()

    press(1)
    act(() =>
      dialog('TimePickerDialog').onDateSelected(new Date(2026, 8, 23, 16))
    )
    expect(onChange).toHaveBeenCalledWith(expect.anything(), maximumDate)
  })

  it('shows one button for a single part', () => {
    mount(AndroidPicker, { iOSMode: 'time', testID: 'reminder' })
    expect(buttons().map((b) => b.props.testID)).toEqual(['reminder-time'])
  })
})

describe('iOS', () => {
  it('renders SwiftUI in the app language and theme', () => {
    const maximumDate = new Date(2026, 8, 30)
    mount(IOSPicker, { iOSMode: 'datetime', maximumDate })
    expect(tree.root.findByType('Host' as never).props.colorScheme).toBe('dark')
    expect(tree.root.findByType('DatePicker' as never).props).toMatchObject({
      selection: value,
      range: { start: undefined, end: maximumDate },
      displayedComponents: ['date', 'hourAndMinute'],
      modifiers: [
        { datePickerStyle: 'compact' },
        { tint: '#accent' },
        { locale: 'es_ES' },
      ],
    })
  })

  it("keeps the device's locale when the app language matches it", () => {
    app.locale = 'en-us'
    mount(IOSPicker)
    expect(tree.root.findByType('DatePicker' as never).props.modifiers).toEqual(
      [{ datePickerStyle: 'compact' }, { tint: '#accent' }]
    )
  })

  it('follows the Format Region and shows the calendar inline', () => {
    prefs.formatRegion = 'es-us'
    mount(IOSPicker, { display: 'inline' })
    expect(tree.root.findByType('DatePicker' as never).props.modifiers).toEqual(
      [
        { datePickerStyle: 'graphical' },
        { tint: '#accent' },
        { locale: 'es_US' },
      ]
    )
  })

  it('keeps picks within the limits', () => {
    const minimumDate = new Date(2026, 8, 20)
    const onChange = mount(IOSPicker, { minimumDate })
    act(() =>
      tree.root
        .findByType('DatePicker' as never)
        .props.onDateChange(new Date(2026, 8, 1))
    )
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'set' }),
      minimumDate
    )
  })
})
