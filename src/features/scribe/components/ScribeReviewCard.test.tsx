import React, { type ReactNode } from 'react'
import moment from 'moment'
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const textSize = vi.hoisted(() => ({ accessibility: false }))

vi.mock('react-native', () => ({ Pressable: 'Pressable', View: 'View' }))
vi.mock('lucide-react-native', () => ({
  Calendar: 'Calendar',
  CalendarClock: 'CalendarClock',
  CalendarCog: 'CalendarCog',
  Check: 'Check',
  Clock: 'Clock',
  DoorClosed: 'DoorClosed',
  Info: 'Info',
  MessageCircle: 'MessageCircle',
  PencilLine: 'PencilLine',
  Plus: 'Plus',
  ShieldCheck: 'ShieldCheck',
  Sparkles: 'Sparkles',
  Tag: 'Tag',
  TriangleAlert: 'TriangleAlert',
  UserRound: 'UserRound',
  UserRoundPlus: 'UserRoundPlus',
  UserRoundSearch: 'UserRoundSearch',
  UsersRound: 'UsersRound',
}))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/DirectionalIcon', () => ({
  ChevronForwardIcon: 'ChevronForward',
}))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/Switch', () => ({ default: 'Switch' }))
vi.mock('@/components/ui/InfoPopover', () => ({ default: 'InfoPopover' }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: () => null }))
vi.mock('@/components/ui/PointerHover', () => ({
  default: ({ children }: { children?: ReactNode }) => children,
  HoverTint: () => null,
}))
vi.mock('@/components/ui/touchTarget', () => ({ MIN_TOUCH_TARGET: 44 }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: new Proxy({}, { get: (_, name) => String(name) }),
    fonts: new Proxy({}, { get: () => 'Font' }),
    fontSize: () => 14,
  }),
}))
vi.mock('@/hooks/useAccessibilityTextSize', () => ({
  default: () => textSize.accessibility,
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (select: (state: { timeDisplayFormat: string }) => unknown) =>
    select({ timeDisplayFormat: 'short' }),
}))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  },
}))
vi.mock('@/lib/dates', () => ({
  formatWeekdayMonthDayCompact: (day: moment.Moment) =>
    day.format('YYYY-MM-DD'),
  formatStartTime: (minutes: number) => `${minutes}@`,
}))
vi.mock('@/lib/minutes', () => ({
  formatMinutes: (minutes: number) => ({ formatted: `${minutes}m` }),
}))

import ScribeReviewCard from '@/features/scribe/components/ScribeReviewCard'
import type {
  ScribeCardContact,
  ScribeEffect,
  ScribeReviewCard as Card,
} from '@/features/scribe/types'

const DAY = '2020-01-15'

const visit: ScribeEffect = {
  id: 'visit',
  kind: 'visit.create',
  preview: {
    kind: 'visit.create',
    date: DAY,
    notAtHome: false,
    bibleStudy: true,
    note: null,
    followUp: null,
    spoken: { date: null, time: null },
  },
  warnings: [],
  status: 'pending',
  skipReason: null,
}

const timeCard = (overrides: Partial<Card> = {}): Card => ({
  id: 'time',
  kind: 'time',
  contact: null,
  effects: [
    {
      id: 'time-effect',
      kind: 'time.create',
      preview: {
        kind: 'time.create',
        date: DAY,
        minutes: 120,
        category: null,
        note: null,
        spoken: { date: null, time: null },
      },
      warnings: [{ code: 'duplicate_time', severity: 'warning' }],
      status: 'pending',
      skipReason: null,
    },
  ],
  selected: true,
  needsChoice: false,
  consent: null,
  needsConsent: false,
  status: 'pending',
  target: null,
  ...overrides,
})

const choice = (
  chosen: Extract<ScribeCardContact, { type: 'choice' }>['chosen']
): Card => ({
  id: 'maria',
  kind: 'contact',
  contact: {
    type: 'choice',
    spokenName: 'Maria',
    options: [
      { contactId: 'm1', name: 'Maria Santos', addressLine: '8 Pine Ave' },
      { contactId: 'm2', name: 'Maria López', addressLine: '15 Elm St' },
    ],
    chosen,
  },
  effects: [visit],
  selected: true,
  needsChoice: chosen === null,
  consent: null,
  needsConsent: false,
  status: 'pending',
  target: null,
})

const render = (card: Card, editable = true, onOpen?: () => void) => {
  const onToggle = vi.fn()
  const onChoose = vi.fn()
  const onConsent = vi.fn()
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(
      <ScribeReviewCard
        card={card}
        editable={editable}
        onToggle={onToggle}
        onChoose={onChoose}
        onConsent={onConsent}
        onOpen={onOpen}
      />
    )
  })
  const root = renderer.root
  const texts = () =>
    root
      .findAllByType('Text' as never)
      .flatMap((node) => node.children)
      .filter((child): child is string => typeof child === 'string')
  const check = () =>
    root
      .findAllByType('Pressable' as never)
      .find((node) => node.props.accessibilityRole === 'checkbox')!
  const opener = () =>
    root
      .findAllByType('Pressable' as never)
      .find((node) => node.props.accessibilityRole === 'button')
  const chips = () =>
    root
      .findAllByType('Button' as never)
      .filter((node) => node.props.accessibilityRole === 'radio')
  const consentSwitch = () => root.findAllByType('Switch' as never)[0]
  return {
    root,
    texts,
    check,
    opener,
    chips,
    consentSwitch,
    onToggle,
    onChoose,
    onConsent,
  }
}

const press = (node: ReactTestInstance) => act(() => node.props.onPress())

describe('ScribeReviewCard', () => {
  beforeEach(() => {
    textSize.accessibility = false
  })

  it('toggles the card from its check', () => {
    const { check, texts, onToggle } = render(timeCard())
    expect(check().props.accessibilityState).toEqual({
      checked: true,
      disabled: false,
    })
    expect(texts()).toContain('scribe_cardTime {"duration":"120m"}')
    expect(texts()).toContain('scribe_warning_duplicateTime')
    press(check())
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('shows an unchecked card as not selected', () => {
    const { check } = render(timeCard({ selected: false }))
    expect(check().props.accessibilityState.checked).toBe(false)
  })

  it('asks which person, and offers each one plus New', () => {
    const { texts, chips, onChoose } = render(choice(null))
    expect(texts()).toContain('scribe_whichContact {"name":"Maria"}')
    expect(texts()).toContain('scribe_needsALook')
    expect(chips().map((chip) => chip.props.accessibilityLabel)).toEqual([
      'Maria Santos, 8 Pine Ave',
      'Maria López, 15 Elm St',
      'scribe_choiceNew',
    ])
    expect(
      chips().every((chip) => chip.props.accessibilityState.checked === false)
    ).toBe(true)

    press(chips()[1])
    expect(onChoose).toHaveBeenLastCalledWith({
      type: 'existing',
      contactId: 'm2',
    })
    press(chips()[2])
    expect(onChoose).toHaveBeenLastCalledWith({ type: 'new' })
  })

  it('titles a resolved choice with the person picked', () => {
    const { texts, chips } = render(
      choice({ type: 'existing', contactId: 'm1' })
    )
    expect(texts()).toContain('Maria Santos')
    expect(texts()).not.toContain('scribe_needsALook')
    expect(chips()[0].props.accessibilityState.checked).toBe(true)
  })

  it('tags a choice resolved to a new person, by name', () => {
    const { texts, chips } = render(choice({ type: 'new' }))
    expect(texts()).toContain('scribe_newContact')
    expect(texts()).toContain('Maria')
    expect(texts()).not.toContain('scribe_whichContact {"name":"Maria"}')
    expect(chips()[2].props.accessibilityState.checked).toBe(true)
  })

  it('locks a settled card and shows what was added', () => {
    const applied = render(timeCard({ status: 'applied' }), false)
    expect(applied.check().props.disabled).toBe(true)
    expect(applied.check().props.accessibilityState.checked).toBe(true)
    expect(applied.texts()).not.toContain('scribe_notAdded')

    const skipped = render(timeCard({ status: 'skipped' }), false)
    expect(skipped.check().props.accessibilityState.checked).toBe(false)
    expect(skipped.texts()).toContain('scribe_notAdded')

    expect(render(timeCard({ status: 'failed' }), false).texts()).toContain(
      'scribe_notAdded'
    )
  })

  it('says an unchecked card wasn’t added, without warning about it', () => {
    const { texts } = render(
      timeCard({ selected: false, status: 'dismissed' }),
      false
    )
    expect(texts()).toContain('scribe_notAdded')
  })

  it('opens what an added card wrote', () => {
    const onOpen = vi.fn()
    const { opener, check } = render(
      timeCard({ status: 'applied' }),
      false,
      onOpen
    )
    expect(check()).toBeUndefined()
    press(opener()!)
    expect(onOpen).toHaveBeenCalledTimes(1)

    const pending = render(timeCard(), true, onOpen)
    expect(pending.opener()).toBeUndefined()
    press(pending.check())
    expect(pending.onToggle).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('reads the tag, the spoken phrase and Not added with the card', () => {
    expect(render(choice(null)).check().props.accessibilityLabel).toBe(
      'scribe_whichContact {"name":"Maria"}, scribe_needsALook, ' +
        'scribe_cardVisit · 2020-01-15 · scribe_cardBibleStudy'
    )
    const spoken = timeCard()
    spoken.effects[0].preview = {
      ...(spoken.effects[0].preview as Extract<
        ScribeEffect['preview'],
        { kind: 'time.create' }
      >),
      spoken: { date: 'this morning', time: null },
    }
    expect(render(spoken).check().props.accessibilityLabel).toContain(
      'scribe_fromSpoken'
    )
    expect(
      render(timeCard({ status: 'skipped' }), false).check().props
        .accessibilityLabel
    ).toMatch(/, scribe_notAdded$/)
  })

  it('hides the choice chips once the card is settled', () => {
    expect(render(choice(null), false).chips()).toHaveLength(0)
  })

  it('nests a new contact’s visit under it', () => {
    const { texts } = render({
      id: 'daniel',
      kind: 'contact',
      contact: { type: 'new', name: 'Daniel Reyes', addressLine: '42 Oak St' },
      effects: [
        {
          ...visit,
          id: 'contact',
          kind: 'contact.create',
          preview: {
            kind: 'contact.create',
            name: 'Daniel Reyes',
            address: '42 Oak St',
            phone: null,
            email: null,
          },
        },
        visit,
      ],
      selected: true,
      needsChoice: false,
      consent: null,
      needsConsent: false,
      status: 'pending',
      target: null,
    })
    expect(texts()).toEqual(
      expect.arrayContaining([
        'Daniel Reyes',
        'scribe_newContact',
        '42 Oak St',
        'scribe_cardVisit',
      ])
    )
  })

  it('shows everything a new contact will be saved with', () => {
    const { texts, root } = render({
      id: 'daniel',
      kind: 'contact',
      contact: { type: 'new', name: 'Daniel Reyes', addressLine: '42 Oak St' },
      effects: [
        {
          ...visit,
          id: 'contact',
          kind: 'contact.create',
          preview: {
            kind: 'contact.create',
            name: 'Daniel Reyes',
            address: '42 Oak St',
            phone: '555-0199',
            email: 'daniel@example.com',
          },
        },
      ],
      selected: true,
      needsChoice: false,
      consent: null,
      needsConsent: false,
      status: 'pending',
      target: null,
    })
    expect(texts()).toContain('42 Oak St · 555-0199 · daniel@example.com')

    const capped = root
      .findAllByType('Text' as never)
      .filter((node) =>
        ['Daniel Reyes', '42 Oak St · 555-0199 · daniel@example.com'].includes(
          node.children[0] as string
        )
      )
      .map((node) => node.props.numberOfLines)
    expect(capped).toEqual([undefined, undefined])
  })

  it('shows a whole title and details at accessibility text sizes', () => {
    const card = timeCard()
    const preview = card.effects[0].preview
    const longCard = timeCard({
      effects: [
        {
          ...card.effects[0],
          preview: {
            ...preview,
            note: 'Cart witnessing at the train station by the north entrance',
          } as typeof preview,
        },
      ],
    })
    const linesOf = (root: ReactTestInstance) =>
      root
        .findAllByType('Text' as never)
        .map((node) => node.props.numberOfLines)
    expect(linesOf(render(longCard).root)).toContain(2)
    textSize.accessibility = true
    expect(
      linesOf(render(longCard).root).filter((n) => n !== undefined)
    ).toEqual([])
    expect(
      render(choice(null))
        .chips()
        .flatMap((chip) => chip.findAllByType('Text' as never))
        .map((node) => node.props.numberOfLines)
    ).toEqual([undefined, undefined, undefined, undefined, undefined])
  })

  it('marks a warning as a problem, and an overlap as worth knowing', () => {
    const card = timeCard()
    const { root } = render(
      timeCard({
        effects: [
          {
            ...card.effects[0],
            warnings: [
              { code: 'duplicate_time', severity: 'warning' },
              { code: 'plan_overlap', severity: 'info' },
            ],
          },
        ],
      })
    )
    const icons = root
      .findAll(
        (node) =>
          node.props.icon === 'TriangleAlert' || node.props.icon === 'Info'
      )
      .map((node) => node.props.icon)
    expect(icons).toEqual(['TriangleAlert', 'Info'])
  })

  it('lists a contact’s changes under its name, without repeating it', () => {
    const { texts } = render({
      id: 'bruno',
      kind: 'contact',
      contact: {
        type: 'existing',
        contactId: 'c1',
        name: 'Bruno Okafor',
        addressLine: '107 Mission St',
      },
      effects: [
        {
          ...visit,
          id: 'update',
          kind: 'contact.update',
          preview: {
            kind: 'contact.update',
            name: 'Bruno Okafor',
            changes: [
              { field: 'phone', before: '555-0100', after: '555-0199' },
            ],
          },
        },
      ],
      selected: true,
      needsChoice: false,
      consent: null,
      needsConsent: false,
      status: 'pending',
      target: null,
    })
    expect(texts()).toContain('Bruno Okafor')
    expect(texts()).toContain(
      'scribe_cardChange {"field":"scribe_field_phone","before":"555-0100","after":"555-0199"}'
    )
    expect(texts().join(' ')).not.toContain('scribe_cardContactUpdate')
  })

  describe('data protection mode', () => {
    const newPerson = (
      given: boolean,
      overrides: Partial<Card> = {}
    ): Card => ({
      id: 'okoro',
      kind: 'contact',
      contact: {
        type: 'new',
        name: 'Daniel Okoro',
        addressLine: '14 Birch Lane',
      },
      effects: [visit],
      selected: true,
      needsChoice: false,
      consent: { given },
      needsConsent: !given,
      status: 'pending',
      target: null,
      ...overrides,
    })

    it('asks whether a new householder agreed, with what to ask them', () => {
      const { root, consentSwitch, onConsent, onToggle } = render(
        newPerson(false)
      )
      const label = 'scribe_consentLabel {"name":"Daniel Okoro"}'
      expect(consentSwitch().props).toMatchObject({
        value: false,
        accessibilityLabel: label,
      })
      expect(root.findByType('InfoPopover' as never).props.description).toBe(
        'dataProtectionConsentInfoDesc'
      )
      act(() => consentSwitch().props.onValueChange(true))
      expect(onConsent).toHaveBeenCalledWith(true)

      expect(onToggle).not.toHaveBeenCalled()
    })

    it('flags the card until they agreed', () => {
      const border = (card: Card) =>
        render(card).root.findAllByType('View' as never)[0].props.style
          .borderColor
      expect(border(newPerson(false))).toBe('warn')
      expect(border(newPerson(true))).toBe('border')
      expect(render(newPerson(true)).consentSwitch().props.value).toBe(true)
    })

    it('names the person the User picked New for', () => {
      const card: Card = {
        ...choice({ type: 'new' }),
        consent: { given: false },
        needsConsent: true,
      }
      expect(render(card).consentSwitch().props.accessibilityLabel).toBe(
        'scribe_consentLabel {"name":"Maria"}'
      )
    })

    it('leaves the agreement off settled cards and cards that don’t ask', () => {
      expect(
        render(newPerson(true, { status: 'applied' }), false).consentSwitch()
      ).toBeUndefined()
      expect(render(timeCard()).consentSwitch()).toBeUndefined()
    })
  })
})
