import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'ios', select: (options: { ios?: unknown }) => options.ios },
  AppState: { currentState: 'active', addEventListener: vi.fn() },
}))
vi.mock('expo-crypto', () => ({
  randomUUID: () => 'test-uuid',
  getRandomBytes: (n: number) => new Uint8Array(n),
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import { scribeTool } from '@/features/scribe/tools'
import {
  buildCards,
  canAddProposal,
  mergeCards,
  proposalCounts,
  toScribeProposal,
  withCardToggled,
  withConsent,
  withContactChosen,
} from '@/features/scribe/proposals/cards'
import type { StoredProposal } from '@/features/scribe/proposals/model'
import {
  fixtureContext,
  fixtureStores,
  PREFERENCES,
  TODAY,
  type FixtureContext,
} from '@/features/scribe/tools/__fixtures__/stores'

let callSeq = 0

function propose(
  fixture: FixtureContext,
  name: string,
  args: Record<string, unknown>
) {
  const tool = scribeTool(name)
  if (!tool || tool.access !== 'write')
    throw new Error(`${name} is not a write tool`)
  const result = tool.propose(args, fixture.ctx)
  if (!result.ok) throw new Error(result.error)
  const callId = `call_${++callSeq}`
  fixture.draft.add(callId, result.effects, fixture.stores, fixture.context)
  return { callId, ref: result.ref }
}

function proposalOf(fixture: FixtureContext): StoredProposal {
  const effects = fixture.draft.storedEffects()
  return {
    id: fixture.draft.proposalId,
    conversationId: 'conversation',
    turnId: 'turn',
    createdAt: 0,
    status: 'pending',
    effects,
    cards: buildCards(effects, fixture.stores),
    invalidCount: 0,
    tainted: false,
    resolvedAt: null,
  }
}

const visit = (
  who: Record<string, unknown>,
  extra: Record<string, unknown> = {}
) => ({
  contactRef: null,
  newContact: null,
  askBetween: null,
  date: TODAY,
  notAtHome: false,
  bibleStudy: false,
  note: null,
  dateSpoken: 'today',
  followUp: null,
  ...who,
  ...extra,
})

const timeLog = (extra: Record<string, unknown> = {}) => ({
  date: TODAY,
  minutes: 60,
  categoryRef: null,
  newCategory: null,
  note: null,
  dateSpoken: null,
  ...extra,
})

describe('"which Maria?"', () => {
  it('asks between the Contacts the model named, blocking Add until answered', () => {
    const fixture = fixtureContext()
    propose(
      fixture,
      'visits_log',
      visit({ askBetween: { spokenName: 'Maria', refs: ['c2', 'c3'] } })
    )
    let proposal = proposalOf(fixture)
    expect(proposal.cards).toHaveLength(1)
    const [card] = proposal.cards
    expect(card.contact).toMatchObject({
      type: 'choice',
      spokenName: 'Maria',
      optionIds: ['contact-maria-lopez', 'contact-maria-chen'],
      chosen: null,
    })
    expect(proposal.effects.map((effect) => effect.draft.kind)).toEqual([
      'contact.create',
      'visit.create',
    ])
    expect(proposalCounts(proposal)).toEqual({
      selected: 1,
      ready: 0,
      needsChoice: 1,
      needsConsent: 0,
    })
    expect(canAddProposal(proposal)).toBe(false)

    expect(
      withContactChosen(proposal, card.id, {
        type: 'existing',
        contactId: 'contact-ben',
      })
    ).toEqual(proposal)
    proposal = withContactChosen(proposal, card.id, {
      type: 'existing',
      contactId: 'contact-maria-chen',
    })
    expect(canAddProposal(proposal)).toBe(true)
    expect(toScribeProposal(proposal, fixture.stores).cards[0]).toMatchObject({
      needsChoice: false,
      contact: {
        type: 'choice',
        chosen: { type: 'existing', contactId: 'contact-maria-chen' },
      },
    })
  })

  it('also asks when a new Contact has an existing Contact’s name', () => {
    const fixture = fixtureContext()
    propose(
      fixture,
      'visits_log',
      visit({ newContact: { name: 'ben okafor', address: null, phone: null } })
    )
    const proposal = proposalOf(fixture)
    expect(proposal.cards[0].contact).toMatchObject({
      type: 'choice',
      optionIds: ['contact-ben'],
    })

    expect(
      canAddProposal(
        withContactChosen(proposal, proposal.cards[0].id, { type: 'new' })
      )
    ).toBe(true)
  })

  it('choosing selects a card the User had unchecked', () => {
    const fixture = fixtureContext()
    propose(
      fixture,
      'visits_log',
      visit({ askBetween: { spokenName: 'Maria', refs: ['c2', 'c3'] } })
    )
    const proposal = proposalOf(fixture)
    const id = proposal.cards[0].id
    const unchecked = withCardToggled(proposal, id)
    expect(proposalCounts(unchecked)).toEqual({
      selected: 0,
      ready: 0,
      needsChoice: 0,
      needsConsent: 0,
    })
    const chosen = withContactChosen(unchecked, id, { type: 'new' })
    expect(chosen.cards[0].selected).toBe(true)
  })
})

describe('a new householder’s consent (data protection mode)', () => {
  const protectedFixture = () =>
    fixtureContext(
      fixtureStores({
        preferences: { ...PREFERENCES, dataProtectionMode: true },
      })
    )
  const AGREED_AT = new Date('2026-10-22T15:04:00Z')

  it('blocks Add until the User confirms the person agreed', () => {
    const fixture = protectedFixture()
    propose(
      fixture,
      'visits_log',
      visit({ newContact: { name: 'Ama', address: null, phone: null } })
    )
    propose(fixture, 'time_log', timeLog())
    let proposal = proposalOf(fixture)
    const [card] = proposal.cards
    expect(card.consent).toEqual({ givenAt: null })
    expect(proposal.cards[1].consent).toBeUndefined()
    expect(proposalCounts(proposal)).toEqual({
      selected: 2,
      ready: 1,
      needsChoice: 0,
      needsConsent: 1,
    })
    expect(canAddProposal(proposal)).toBe(false)
    expect(toScribeProposal(proposal, fixture.stores).cards[0]).toMatchObject({
      consent: { given: false },
      needsConsent: true,
    })

    proposal = withConsent(proposal, card.id, true, AGREED_AT)
    expect(proposal.cards[0].consent).toEqual({
      givenAt: '2026-10-22T15:04:00.000Z',
    })
    expect(canAddProposal(proposal)).toBe(true)
    expect(toScribeProposal(proposal, fixture.stores).cards[0]).toMatchObject({
      consent: { given: true },
      needsConsent: false,
    })

    proposal = withConsent(proposal, card.id, false, AGREED_AT)
    expect(canAddProposal(proposal)).toBe(false)
  })

  it('lets the User leave the person out and add the rest', () => {
    const fixture = protectedFixture()
    propose(fixture, 'contacts_create', {
      name: 'Ama',
      address: null,
      phone: null,
      email: null,
    })
    propose(fixture, 'time_log', timeLog())
    const proposal = proposalOf(fixture)
    const unchecked = withCardToggled(proposal, proposal.cards[0].id)
    expect(proposalCounts(unchecked).needsConsent).toBe(0)
    expect(canAddProposal(unchecked)).toBe(true)

    expect(
      withConsent(unchecked, proposal.cards[0].id, true, AGREED_AT).cards[0]
        .selected
    ).toBe(true)
  })

  it('asks only when Add would create the Contact', () => {
    const fixture = protectedFixture()
    propose(
      fixture,
      'visits_log',
      visit({ newContact: { name: 'ben okafor', address: null, phone: null } })
    )
    const proposal = proposalOf(fixture)
    const id = proposal.cards[0].id

    expect(proposalCounts(proposal)).toMatchObject({
      needsChoice: 1,
      needsConsent: 0,
    })
    expect(toScribeProposal(proposal, fixture.stores).cards[0].consent).toBe(
      null
    )
    const existing = withContactChosen(proposal, id, {
      type: 'existing',
      contactId: 'contact-ben',
    })
    expect(canAddProposal(existing)).toBe(true)
    const created = withContactChosen(proposal, id, { type: 'new' })
    expect(canAddProposal(created)).toBe(false)
    expect(toScribeProposal(created, fixture.stores).cards[0]).toMatchObject({
      consent: { given: false },
      needsConsent: true,
    })
  })

  it('isn’t asked outside data protection mode', () => {
    const fixture = fixtureContext()
    propose(
      fixture,
      'visits_log',
      visit({ newContact: { name: 'Ama', address: null, phone: null } })
    )
    const proposal = proposalOf(fixture)
    expect(proposal.cards[0].consent).toBeUndefined()
    expect(canAddProposal(proposal)).toBe(true)
  })

  it('keeps the agreement when a retried turn adds cards', () => {
    const fixture = protectedFixture()
    propose(
      fixture,
      'visits_log',
      visit({ newContact: { name: 'Ama', address: null, phone: null } })
    )
    const agreed = withConsent(
      proposalOf(fixture),
      proposalOf(fixture).cards[0].id,
      true,
      AGREED_AT
    )
    propose(fixture, 'time_log', timeLog())
    const merged = mergeCards(agreed.cards, proposalOf(fixture).cards)
    expect(merged[0].consent).toEqual({
      givenAt: '2026-10-22T15:04:00.000Z',
    })
  })
})

describe('cards', () => {
  it('puts a new Contact and its Visits on one card, merged by name', () => {
    const fixture = fixtureContext()
    const created = propose(fixture, 'contacts_create', {
      name: 'Ana Silva',
      address: null,
      phone: null,
      email: null,
    })
    propose(
      fixture,
      'visits_log',
      visit({
        newContact: {
          name: 'Ana Silva',
          address: {
            line1: '5 Pine St',
            city: null,
            state: null,
            zip: null,
            country: null,
          },
          phone: null,
        },
      })
    )
    propose(
      fixture,
      'visits_log',
      visit(
        { contactRef: created.ref },
        { date: '2026-10-20', dateSpoken: 'yesterday' }
      )
    )
    const proposal = proposalOf(fixture)

    const creates = proposal.effects.filter(
      (effect) => effect.draft.kind === 'contact.create'
    )
    expect(creates).toHaveLength(1)

    expect(creates[0].draft).toMatchObject({
      name: 'Ana Silva',
      address: { line1: '5 Pine St' },
    })
    expect(creates[0].callIds).toHaveLength(2)
    expect(proposal.cards).toHaveLength(1)
    expect(proposal.cards[0].contact).toEqual({ type: 'new', ref: created.ref })
    expect(proposal.cards[0].effectIds).toHaveLength(3)
  })

  it('gives time, plans and categories a card each, in call order', () => {
    const fixture = fixtureContext()
    propose(fixture, 'plans_create', {
      date: '2026-10-23',
      minutes: 60,
      startMinutes: null,
      anytime: true,
      categoryRef: null,
      newCategory: null,
      title: null,
      note: null,
      dateSpoken: 'Friday',
      timeSpoken: null,
      withBuddies: null,
      repeats: false,
    })
    propose(fixture, 'time_log', timeLog())
    propose(fixture, 'categories_create', { name: 'Hospital', credit: true })
    expect(proposalOf(fixture).cards.map((card) => card.kind)).toEqual([
      'plan',
      'time',
      'category',
    ])
  })

  it('puts a newCategory on its own card ahead of the time in it', () => {
    const fixture = fixtureContext()
    propose(
      fixture,
      'time_log',
      timeLog({ newCategory: { name: 'Hospital', credit: true } })
    )
    const proposal = proposalOf(fixture)
    expect(
      toScribeProposal(proposal, fixture.stores).cards.map((card) => ({
        kind: card.kind,
        previews: card.effects.map((effect) => effect.preview),
      }))
    ).toMatchObject([
      {
        kind: 'category',
        previews: [{ kind: 'category.create', name: 'Hospital', credit: true }],
      },
      {
        kind: 'time',
        previews: [
          {
            kind: 'time.create',
            category: { name: 'Hospital', credit: true },
          },
        ],
      },
    ])
  })

  it('keeps the User’s picks when a retried turn adds cards', () => {
    const fixture = fixtureContext()
    propose(
      fixture,
      'visits_log',
      visit({ askBetween: { spokenName: 'Maria', refs: ['c2', 'c3'] } })
    )
    propose(fixture, 'time_log', timeLog())
    const before = proposalOf(fixture)
    const picked = withCardToggled(
      withContactChosen(before, before.cards[0].id, { type: 'new' }),
      before.cards[1].id
    )
    propose(fixture, 'time_log', timeLog({ date: '2026-10-20', minutes: 30 }))
    const after = proposalOf(fixture)
    const merged = mergeCards(picked.cards, after.cards)
    expect(merged).toHaveLength(3)
    expect(merged[0].contact).toMatchObject({ chosen: { type: 'new' } })
    expect(merged.map((card) => card.selected)).toEqual([true, false, true])
  })
})

describe('warnings', () => {
  const warningCodes = (fixture: FixtureContext) =>
    fixture.draft
      .storedEffects()
      .map((effect) => effect.warnings.map((w) => w.code))

  it('flags the same minutes already logged that day', () => {
    const fixture = fixtureContext()
    propose(fixture, 'time_log', timeLog({ date: '2026-10-14', minutes: 90 }))
    propose(fixture, 'time_log', timeLog({ date: '2026-10-14', minutes: 45 }))
    expect(warningCodes(fixture)).toEqual([['duplicate_time'], []])
  })

  it('flags credit over the month’s cap', () => {
    const fixture = fixtureContext()
    propose(fixture, 'time_log', timeLog({ categoryRef: 'k1', minutes: 1_440 }))
    propose(fixture, 'time_log', timeLog({ categoryRef: 'k1', minutes: 30 }))

    expect(warningCodes(fixture)).toEqual([[], []])
    const crowded = fixtureContext(
      fixtureStores({
        serviceReports: {
          2026: {
            9: [
              {
                id: 'big',
                hours: 54,
                minutes: 0,
                date: new Date('2026-10-10T12:00:00.000Z'),
              },
            ],
          },
        },
      })
    )
    propose(crowded, 'time_log', timeLog({ categoryRef: 'k1', minutes: 90 }))
    expect(warningCodes(crowded)).toEqual([['over_credit_cap']])

    propose(
      crowded,
      'time_log',
      timeLog({ minutes: 90, newCategory: { name: 'Hospital', credit: true } })
    )
    expect(warningCodes(crowded)).toEqual([
      ['over_credit_cap'],
      [],
      ['over_credit_cap'],
    ])
  })

  it('notes a timed Plan overlapping another that day', () => {
    const fixture = fixtureContext()
    const plan = (startMinutes: number) => ({
      date: '2026-10-22',
      minutes: 60,
      startMinutes,
      anytime: false,
      categoryRef: null,
      newCategory: null,
      title: null,
      note: null,
      dateSpoken: 'Thursday',
      timeSpoken: null,
      withBuddies: null,
      repeats: false,
    })
    propose(fixture, 'plans_create', plan(10 * 60))
    propose(fixture, 'plans_create', plan(14 * 60))
    expect(warningCodes(fixture)).toEqual([['plan_overlap'], []])
  })

  it('says a checkbox month is only marked shared', () => {
    const fixture = fixtureContext(
      fixtureStores({ preferences: { ...PREFERENCES, role: 'publisher' } })
    )
    expect(fixture.context.publisher.showsTimeEntry).toBe(false)
    propose(fixture, 'time_log', timeLog({ minutes: 0 }))
    expect(fixture.draft.storedEffects()[0].warnings).toEqual([
      { code: 'shared_month', severity: 'info' },
    ])
  })
})

describe('previews', () => {
  it('carries relative phrases and follow-up dates from the context', () => {
    const fixture = fixtureContext()
    propose(
      fixture,
      'visits_log',
      visit(
        { contactRef: 'c1' },
        {
          dateSpoken: 'today',
          followUp: {
            date: '2026-10-28',
            topic: 'Bring the brochure',
            dateSpoken: 'next Wednesday',
          },
        }
      )
    )
    const preview = toScribeProposal(proposalOf(fixture), fixture.stores)
      .cards[0]
    expect(preview.contact).toMatchObject({
      type: 'existing',
      contactId: 'contact-ben',
    })
    expect(preview.effects[0].preview).toMatchObject({
      kind: 'visit.create',
      date: TODAY,
      followUp: { date: '2026-10-28', topic: 'Bring the brochure' },
    })
  })

  it('labels a Time Entry’s Category and keeps what the User said', () => {
    const fixture = fixtureContext()
    propose(
      fixture,
      'time_log',
      timeLog({ categoryRef: 'k1', dateSpoken: 'this morning' })
    )
    expect(
      toScribeProposal(proposalOf(fixture), fixture.stores).cards[0].effects[0]
        .preview
    ).toMatchObject({
      kind: 'time.create',
      minutes: 60,
      category: { name: 'Bethel', credit: true },
      spoken: { date: 'this morning', time: null },
    })
  })

  it('shows a Plan change as before and after', () => {
    const fixture = fixtureContext()
    propose(fixture, 'plans_update', {
      planRef: 'p1',
      onDate: null,
      date: null,
      minutes: 180,
      startMinutes: null,
      anytime: null,
      title: null,
      note: null,
      dateSpoken: null,
      timeSpoken: null,
    })
    const preview = toScribeProposal(proposalOf(fixture), fixture.stores)
      .cards[0].effects[0].preview
    expect(preview).toMatchObject({
      kind: 'plan.update',
      changes: [{ field: 'minutes', before: 120, after: 180 }],
    })
  })
})
