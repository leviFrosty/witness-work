import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: vi.fn(),
}))
vi.mock('@/lib/contactAvatarFiles', () => ({
  deleteAvatarFiles: vi.fn(async () => {}),
}))
const { capture, failPlans } = vi.hoisted(() => ({
  capture: vi.fn(),
  failPlans: { on: false },
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture } }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn(), captureMessage: vi.fn() },
}))
// A write that throws part-way, for the rollback.
vi.mock('@/features/scribe/proposals/effects/plan', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/features/scribe/proposals/effects/plan')
    >()
  return {
    ...actual,
    applyPlanCreate: (...args: Parameters<typeof actual.applyPlanCreate>) => {
      if (failPlans.on) throw new Error('storage full')
      return actual.applyPlanCreate(...args)
    },
  }
})

import moment from 'moment'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { usePreferences } from '@/stores/preferences'
import { lastUserAction } from '@/lib/userAction'
import { scribeTool } from '@/features/scribe/tools'
import {
  readScribeStores,
  allTimeEntries,
} from '@/features/scribe/runtime/snapshot'
import { applyProposal } from '@/features/scribe/proposals/apply'
import { applyTimeCreate } from '@/features/scribe/proposals/effects/time'
import { applyPlanCreate } from '@/features/scribe/proposals/effects/plan'
import { applyVisitCreate } from '@/features/scribe/proposals/effects/visit'
import { storedDayKey } from '@/lib/normalizeDate'
import { undoApplied } from '@/features/scribe/proposals/undo'
import {
  buildCards,
  toScribeProposal,
  withCardToggled,
  withContactChosen,
} from '@/features/scribe/proposals/cards'
import type { StoredProposal } from '@/features/scribe/proposals/model'
import {
  addScribeProposal,
  dismissScribeProposal,
  undoScribeProposalNow,
} from '@/features/scribe/proposals/actions'
import {
  getConversation,
  newConversation,
  putConversation,
  useScribeConversations,
} from '@/features/scribe/stores/conversations'
import {
  getApplyRecord,
  useScribeLedger,
} from '@/features/scribe/stores/ledger'
import {
  fixtureContext,
  fixtureStores,
  NOW,
  PREFERENCES,
  TODAY,
  type FixtureContext,
} from '@/features/scribe/tools/__fixtures__/stores'

let idSeq = 0
const newId = () => `new-${++idSeq}`

function seed() {
  const stores = fixtureStores()
  useContacts.setState({ contacts: [...stores.contacts], deletedContacts: [] })
  useConversations.setState({
    conversations: [...stores.visits],
    deletedConversations: [],
  })
  useServiceReport.setState({
    serviceReports: stores.serviceReports,
    dayPlans: [...stores.dayPlans],
    recurringPlans: [...stores.recurringPlans],
  })
  useCategories.setState({ categories: [...stores.categories] })
  usePreferences.setState({
    role: PREFERENCES.role,
    dataProtectionMode: false,
  })
}

/** What the User's records look like, to compare before and after. */
const records = () => ({
  contacts: useContacts
    .getState()
    .contacts.map(({ id, name, phone, address }) => ({
      id,
      name,
      phone,
      address,
    }))
    .sort((a, b) => a.id.localeCompare(b.id)),
  visits: useConversations
    .getState()
    .conversations.map((visit) => visit.id)
    .sort(),
  entries: allTimeEntries(useServiceReport.getState().serviceReports)
    .map((entry) => entry.id)
    .sort(),
  plans: useServiceReport
    .getState()
    .dayPlans.map(({ id, minutes, startTimeInMinutes }) => ({
      id,
      minutes,
      startTimeInMinutes,
    }))
    .sort((a, b) => a.id.localeCompare(b.id)),
  categories: useCategories
    .getState()
    .categories.map((category) => category.id)
    .sort(),
})

/** The record id a fixture Ref names. */
const contactOf = (fixture: FixtureContext, ref: string): string => {
  const resolved = fixture.refs.resolve(ref)
  if (!resolved || resolved.kind !== 'c') throw new Error(ref)
  return resolved.id
}

let callSeq = 0
function propose(
  fixture: FixtureContext,
  name: string,
  args: Record<string, unknown>
) {
  const tool = scribeTool(name)
  if (!tool || tool.access === 'read' || tool.access === 'memory')
    throw new Error(name)
  const result = tool.propose(args, fixture.ctx)
  if (!result.ok) throw new Error(result.error)
  fixture.draft.add(
    `call_${++callSeq}`,
    result.effects,
    fixture.stores,
    fixture.context
  )
  return result.ref
}

function proposalOf(
  fixture: FixtureContext,
  conversationId = 'conversation'
): StoredProposal {
  const effects = fixture.draft.storedEffects()
  return {
    id: fixture.draft.proposalId,
    conversationId,
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

const timeLog = (extra: Record<string, unknown> = {}) => ({
  date: TODAY,
  minutes: 60,
  categoryRef: null,
  newCategory: null,
  note: null,
  dateSpoken: null,
  ...extra,
})
const planCreate = (extra: Record<string, unknown> = {}) => ({
  date: '2026-10-23',
  minutes: 120,
  startMinutes: 9 * 60,
  anytime: false,
  categoryRef: null,
  newCategory: null,
  title: null,
  note: null,
  dateSpoken: 'Friday',
  timeSpoken: '9',
  withBuddies: null,
  repeats: false,
  ...extra,
})
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
  note: 'Talked about the hope for the future.',
  dateSpoken: 'today',
  followUp: null,
  ...who,
  ...extra,
})
const planUpdate = (extra: Record<string, unknown>) => ({
  planRef: 'p1',
  onDate: null,
  date: null,
  minutes: null,
  startMinutes: null,
  anytime: null,
  title: null,
  note: null,
  dateSpoken: null,
  timeSpoken: null,
  ...extra,
})

/** A Proposal with one of every kind. */
function everyKind() {
  const fixture = fixtureContext(readScribeStores())
  const categoryRef = propose(fixture, 'categories_create', {
    name: 'Hospital',
    credit: true,
  })
  propose(fixture, 'time_log', timeLog({ categoryRef }))
  const contactRef = propose(fixture, 'contacts_create', {
    name: 'Ana Silva',
    address: null,
    phone: null,
    email: null,
  })
  propose(
    fixture,
    'visits_log',
    visit(
      { contactRef },
      {
        followUp: {
          date: '2026-10-28',
          topic: null,
          dateSpoken: 'next Wednesday',
        },
      }
    )
  )
  propose(fixture, 'contacts_update', {
    contactRef: 'c1',
    name: null,
    phone: '555-0199',
    email: null,
    address: null,
  })
  propose(fixture, 'plans_create', planCreate())
  propose(fixture, 'plans_update', planUpdate({ minutes: 180 }))
  return {
    fixture,
    proposal: proposalOf(fixture),
    contactRef: contactRef!,
    categoryRef: categoryRef!,
    newCategory: null,
  }
}

beforeEach(() => {
  seed()
  failPlans.on = false
  capture.mockClear()
  useScribeConversations.setState(
    useScribeConversations.getInitialState(),
    true
  )
  useScribeLedger.setState(useScribeLedger.getInitialState(), true)
})

describe('the apply saga', () => {
  it('writes every kind in order, binding the new Refs to what they created', () => {
    const before = records()
    const { proposal, contactRef, categoryRef } = everyKind()
    const run = applyProposal(proposal, {
      now: NOW,
      prefs: readScribeStores().preferences,
      newId,
    })

    expect(run.error).toBeNull()
    expect(run.result).toEqual({
      status: 'applied',
      appliedCards: proposal.cards.length,
      skippedCards: 0,
    })
    expect(run.applied.map((effect) => effect.kind)).toEqual([
      'category.create',
      'contact.create',
      'contact.update',
      'visit.create',
      'time.create',
      'plan.create',
      'plan.update',
    ])
    const bound = Object.fromEntries(
      run.bindings.map(({ ref, id }) => [ref, id])
    )
    const category = useCategories
      .getState()
      .categories.find((c) => c.name === 'Hospital')!
    const contact = useContacts
      .getState()
      .contacts.find((c) => c.name === 'Ana Silva')!
    expect(bound).toEqual({
      [categoryRef]: category.id,
      [contactRef]: contact.id,
    })
    expect(category.isCredit).toBe(true)

    // The Time Entry uses the new Category; the Visit, the new Contact.
    const entry = allTimeEntries(
      useServiceReport.getState().serviceReports
    ).find((item) => !before.entries.includes(item.id))!
    expect(entry).toMatchObject({
      categoryId: category.id,
      hours: 1,
      minutes: 0,
    })
    expect(moment.utc(entry.date).format('YYYY-MM-DD')).toBe(TODAY)
    const added = useConversations
      .getState()
      .conversations.find((v) => !before.visits.includes(v.id))!
    expect(added.contact.id).toBe(contact.id)
    expect(moment(added.followUp!.date).format('YYYY-MM-DD')).toBe('2026-10-28')

    expect(
      useContacts.getState().contacts.find((c) => c.id === 'contact-ben')!.phone
    ).toBe('555-0199')
    expect(
      useServiceReport
        .getState()
        .dayPlans.find((p) => p.id === 'plan-thursday')!.minutes
    ).toBe(180)
    expect(run.proposal.status).toBe('applied')
    expect(run.proposal.cards.every((card) => card.status === 'applied')).toBe(
      true
    )
    expect(run.outcome).toMatchObject({ outcome: 'applied', notApplied: [] })
    // The next message names which added call made each new Ref real.
    const creator = (ref: string) =>
      proposal.effects.find(
        (effect) =>
          (effect.draft.kind === 'contact.create' ||
            effect.draft.kind === 'category.create') &&
          effect.draft.ref === ref
      )!.callIds[0]
    expect(run.outcome.created).toEqual([
      { callId: creator(categoryRef), ref: categoryRef },
      { callId: creator(contactRef), ref: contactRef },
    ])
  })

  it('names no new Ref whose call was left out', () => {
    const fixture = fixtureContext(readScribeStores())
    propose(fixture, 'contacts_create', {
      name: 'Ana Silva',
      address: null,
      phone: null,
      email: null,
    })
    propose(fixture, 'time_log', timeLog())
    const proposal = proposalOf(fixture)
    const contactCard = proposal.cards.find((card) => card.kind === 'contact')!
    const run = applyProposal(withCardToggled(proposal, contactCard.id), {
      now: NOW,
      prefs: readScribeStores().preferences,
      newId,
    })
    expect(run.outcome.outcome).toBe('partially_applied')
    expect(run.outcome.created).toBeUndefined()
  })

  it('writes only the selected cards', () => {
    const fixture = fixtureContext(readScribeStores())
    propose(fixture, 'time_log', timeLog())
    propose(fixture, 'plans_create', planCreate())
    const proposal = proposalOf(fixture)
    const run = applyProposal(withCardToggled(proposal, proposal.cards[1].id), {
      now: NOW,
      prefs: readScribeStores().preferences,
      newId,
    })
    expect(run.applied.map((effect) => effect.kind)).toEqual(['time.create'])
    expect(run.proposal.cards.map((card) => card.status)).toEqual([
      'applied',
      'dismissed',
    ])
    expect(run.result.status).toBe('partially_applied')
    expect(run.outcome.applied).toHaveLength(1)
    expect(run.outcome.notApplied).toHaveLength(1)
  })

  it('creates a newCategory first, for the time and the plan that name it', () => {
    const fixture = fixtureContext(readScribeStores())
    const ref = propose(
      fixture,
      'time_log',
      timeLog({ newCategory: { name: 'Hospital', credit: true } })
    )
    propose(
      fixture,
      'plans_create',
      planCreate({ newCategory: { name: 'hospital', credit: true } })
    )
    const proposal = proposalOf(fixture)
    expect(proposal.cards.map((card) => card.kind)).toEqual([
      'category',
      'time',
      'plan',
    ])
    const run = applyProposal(proposal, {
      now: NOW,
      prefs: readScribeStores().preferences,
      newId,
    })

    expect(run.applied.map((effect) => effect.kind)).toEqual([
      'category.create',
      'time.create',
      'plan.create',
    ])
    const category = useCategories
      .getState()
      .categories.find((c) => c.name === 'Hospital')!
    expect(category.isCredit).toBe(true)
    expect(run.bindings).toEqual([{ ref, id: category.id }])
    const entry = allTimeEntries(
      useServiceReport.getState().serviceReports
    ).find((item) => item.categoryId === category.id)
    expect(entry).toMatchObject({ credit: true, hours: 1 })
    expect(
      useServiceReport
        .getState()
        .dayPlans.filter((plan) => plan.categoryId === category.id)
    ).toHaveLength(1)
    // Both calls proposed the Category, so both count as added.
    expect(run.outcome.applied).toHaveLength(2)
    expect(run.outcome.notApplied).toEqual([])
  })

  it('changes the plan plans_update found by its day', () => {
    const fixture = fixtureContext(readScribeStores())
    propose(
      fixture,
      'plans_update',
      planUpdate({ planRef: null, onDate: '2026-10-22', minutes: 60 })
    )
    const run = applyProposal(proposalOf(fixture), {
      now: NOW,
      prefs: readScribeStores().preferences,
      newId,
    })
    expect(run.result.status).toBe('applied')
    expect(
      useServiceReport
        .getState()
        .dayPlans.find((p) => p.id === 'plan-thursday')!.minutes
    ).toBe(60)
  })

  it('logs the Visit to the Contact the User chose, without a new one', () => {
    const fixture = fixtureContext(readScribeStores())
    propose(
      fixture,
      'visits_log',
      visit({ askBetween: { spokenName: 'Maria', refs: ['c2', 'c3'] } })
    )
    const proposal = proposalOf(fixture)
    const chosen = withContactChosen(proposal, proposal.cards[0].id, {
      type: 'existing',
      contactId: 'contact-maria-chen',
    })
    const contactsBefore = useContacts.getState().contacts.length
    const run = applyProposal(chosen, {
      now: NOW,
      prefs: readScribeStores().preferences,
      newId,
    })

    expect(useContacts.getState().contacts).toHaveLength(contactsBefore)
    const added = useConversations.getState().conversations.at(-1)!
    expect(added.contact.id).toBe('contact-maria-chen')
    const create = proposal.effects.find(
      (effect) => effect.draft.kind === 'contact.create'
    )!
    const newRef =
      create.draft.kind === 'contact.create' ? create.draft.ref : null
    expect(run.bindings).toEqual([{ ref: newRef, id: 'contact-maria-chen' }])
    // Its Ref now names the Contact the User picked.
    expect(run.outcome.created).toEqual([
      { callId: create.callIds[0], ref: newRef },
    ])
    expect(run.proposal.cards[0].status).toBe('applied')
    expect(run.result.status).toBe('applied')
  })

  it('skips an update whose record changed, or is gone, since it was proposed', () => {
    const fixture = fixtureContext(readScribeStores())
    propose(fixture, 'plans_update', planUpdate({ minutes: 60 }))
    propose(fixture, 'contacts_update', {
      contactRef: 'c1',
      name: 'Benjamin Okafor',
      phone: null,
      email: null,
      address: null,
    })
    propose(fixture, 'time_log', timeLog())
    const proposal = proposalOf(fixture)

    useServiceReport
      .getState()
      .updateDayPlan({ id: 'plan-thursday', minutes: 240 })
    useContacts.getState().deleteContact('contact-ben')
    const run = applyProposal(proposal, {
      now: NOW,
      prefs: readScribeStores().preferences,
      newId,
    })

    expect(
      run.proposal.effects.map((effect) => [effect.status, effect.skipReason])
    ).toEqual([
      ['skipped', 'changed'],
      ['skipped', 'missing'],
      ['applied', null],
    ])
    expect(
      useServiceReport
        .getState()
        .dayPlans.find((p) => p.id === 'plan-thursday')!.minutes
    ).toBe(240)
    expect(run.result).toEqual({
      status: 'partially_applied',
      appliedCards: 1,
      skippedCards: 2,
    })
  })

  it('undoes everything it wrote when a write throws', () => {
    const before = records()
    const { proposal } = everyKind()
    failPlans.on = true
    const run = applyProposal(proposal, {
      now: NOW,
      prefs: readScribeStores().preferences,
      newId,
    })

    expect(run.error).toBeInstanceOf(Error)
    expect(run.result).toEqual({
      status: 'failed',
      appliedCards: 0,
      skippedCards: 0,
    })
    expect(run.applied).toEqual([])
    expect(run.bindings).toEqual([])
    expect(run.proposal.status).toBe('failed')
    expect(run.outcome).toMatchObject({ outcome: 'failed', applied: [] })
    expect(records()).toEqual(before)
  })
})

describe('undo', () => {
  it('puts every kind back, in reverse', () => {
    const before = records()
    const { proposal, contactRef, categoryRef } = everyKind()
    const run = applyProposal(proposal, {
      now: NOW,
      prefs: readScribeStores().preferences,
      newId,
    })
    const undone = undoApplied(run.applied)

    expect(undone.result).toEqual({ status: 'undone', kept: 0 })
    expect(undone.undone).toHaveLength(7)
    expect(undone.unbound.sort()).toEqual([categoryRef, contactRef].sort())
    expect(records()).toEqual(before)
    // A deleted Plan leaves a tombstone, so the undo syncs.
    const planUndo = run.applied.find(
      (effect) => effect.kind === 'plan.create'
    )!.undo
    expect(planUndo.kind === 'plan.create' && planUndo.planId).toBeTruthy()
    expect(
      useServiceReport.getState().deletedDayPlans.map((plan) => plan.id)
    ).toContain(planUndo.kind === 'plan.create' ? planUndo.planId : null)
  })

  it('removes a newCategory with its time, unless something else now uses it', () => {
    const before = records()
    const applyNew = () => {
      const fixture = fixtureContext(readScribeStores())
      propose(
        fixture,
        'time_log',
        timeLog({ newCategory: { name: 'Hospital', credit: true } })
      )
      return applyProposal(proposalOf(fixture), {
        now: NOW,
        prefs: readScribeStores().preferences,
        newId,
      })
    }

    const first = applyNew()
    const undone = undoApplied(first.applied)
    expect(undone.result).toEqual({ status: 'undone', kept: 0 })
    expect(undone.unbound).toHaveLength(1)
    expect(records()).toEqual(before)

    const second = applyNew()
    const category = useCategories
      .getState()
      .categories.find((c) => c.name === 'Hospital')!
    useServiceReport.getState().addServiceReport({
      id: 'own-entry',
      hours: 2,
      minutes: 0,
      date: new Date('2026-10-20T12:00:00.000Z'),
      categoryId: category.id,
    })
    expect(undoApplied(second.applied).result).toEqual({
      status: 'partially_undone',
      kept: 1,
    })
    expect(
      useCategories.getState().categories.some((c) => c.id === category.id)
    ).toBe(true)
  })

  it('keeps what changed since, or what something else now uses', () => {
    const { proposal } = everyKind()
    const run = applyProposal(proposal, {
      now: NOW,
      prefs: readScribeStores().preferences,
      newId,
    })
    // The User edits the Plan, logs their own Visit for the new Contact, and
    // uses the new Category on another entry.
    useServiceReport
      .getState()
      .updateDayPlan({ id: 'plan-thursday', minutes: 30, updatedAt: 999_999 })
    const contact = useContacts
      .getState()
      .contacts.find((c) => c.name === 'Ana Silva')!
    useConversations.getState().addConversation({
      id: 'own-visit',
      contact: { id: contact.id },
      date: NOW,
    } as never)
    const category = useCategories
      .getState()
      .categories.find((c) => c.name === 'Hospital')!
    useServiceReport.getState().addServiceReport({
      id: 'own-entry',
      hours: 2,
      minutes: 0,
      date: new Date('2026-10-20T12:00:00.000Z'),
      categoryId: category.id,
    })

    const undone = undoApplied(run.applied)
    expect(undone.result).toEqual({ status: 'partially_undone', kept: 3 })
    expect(
      useServiceReport
        .getState()
        .dayPlans.find((p) => p.id === 'plan-thursday')!.minutes
    ).toBe(30)
    expect(
      useContacts.getState().contacts.some((c) => c.id === contact.id)
    ).toBe(true)
    expect(
      useCategories.getState().categories.some((c) => c.id === category.id)
    ).toBe(true)
    expect(undone.unbound).toEqual([])
  })

  it('undoes a new address after the lookup has placed its pin', () => {
    const fixture = fixtureContext(readScribeStores())
    propose(fixture, 'contacts_update', {
      contactRef: 'c1',
      name: null,
      phone: '555-0199',
      email: null,
      address: {
        line1: '200 Market St',
        city: null,
        state: null,
        zip: null,
        country: null,
      },
    })
    const contactId = contactOf(fixture, 'c1')
    const before = useContacts
      .getState()
      .contacts.find((c) => c.id === contactId)!
    const run = applyProposal(proposalOf(fixture), {
      now: NOW,
      prefs: readScribeStores().preferences,
      newId,
    })
    // The address lookup finds the new street and moves the pin.
    useContacts.getState().updateContact({
      id: contactId,
      coordinate: { latitude: 37.79, longitude: -122.4 },
    })

    expect(undoApplied(run.applied).result).toEqual({
      status: 'undone',
      kept: 0,
    })
    const after = useContacts
      .getState()
      .contacts.find((c) => c.id === contactId)!
    expect({
      phone: after.phone,
      address: after.address,
      coordinate: after.coordinate,
    }).toEqual({
      phone: before.phone,
      address: before.address,
      coordinate: before.coordinate,
    })
  })

  it('keeps an update the User edited since, or a pin they placed', () => {
    const fixture = fixtureContext(readScribeStores())
    propose(fixture, 'contacts_update', {
      contactRef: 'c1',
      name: null,
      phone: '555-0199',
      email: null,
      address: null,
    })
    propose(fixture, 'plans_update', planUpdate({ minutes: 180 }))
    const contactId = contactOf(fixture, 'c1')
    const run = applyProposal(proposalOf(fixture), {
      now: NOW,
      prefs: readScribeStores().preferences,
      newId,
    })
    useContacts.getState().updateContact({
      id: contactId,
      coordinate: { latitude: 1, longitude: 2 },
      userDraggedCoordinate: true,
    })
    // Bookkeeping that bumps the Plan without changing it doesn't count.
    useServiceReport
      .getState()
      .updateDayPlan({ id: 'plan-thursday' }, { automatic: true })

    expect(undoApplied(run.applied).result).toEqual({
      status: 'partially_undone',
      kept: 1,
    })
    expect(
      useContacts.getState().contacts.find((c) => c.id === contactId)!.phone
    ).toBe('555-0199')
    expect(
      useServiceReport
        .getState()
        .dayPlans.find((p) => p.id === 'plan-thursday')!.minutes
    ).toBe(120)
  })

  it('has nothing to undo once the records are gone', () => {
    const fixture = fixtureContext(readScribeStores())
    propose(fixture, 'time_log', timeLog())
    const run = applyProposal(proposalOf(fixture), {
      now: NOW,
      prefs: readScribeStores().preferences,
      newId,
    })
    useServiceReport
      .getState()
      .deleteServiceReport(
        allTimeEntries(useServiceReport.getState().serviceReports).find(
          (entry) =>
            entry.id === (run.applied[0].undo as { entryId: string }).entryId
        )!
      )
    expect(undoApplied(run.applied).result).toEqual({
      status: 'nothing_to_undo',
      kept: 0,
    })
  })
})

describe('changing and deleting Time Entries', () => {
  const timeUpdate = (extra: Record<string, unknown>) => ({
    entryRef: null,
    onDate: '2026-10-20',
    date: null,
    minutes: null,
    categoryRef: null,
    note: null,
    dateSpoken: null,
    ...extra,
  })
  const entry = (id: string) =>
    allTimeEntries(useServiceReport.getState().serviceReports).find(
      (candidate) => candidate.id === id
    )
  const apply = (proposal: StoredProposal) =>
    applyProposal(proposal, {
      now: NOW,
      prefs: readScribeStores().preferences,
      newId,
    })

  it('changes an entry, moving it to Standard, and Undo puts it back', () => {
    const fixture = fixtureContext(readScribeStores())
    propose(
      fixture,
      'time_update',
      timeUpdate({ minutes: 2520, categoryRef: 'k0', note: 'Cart' })
    )
    const run = apply(proposalOf(fixture))

    expect(run.applied.map((effect) => effect.kind)).toEqual(['time.update'])
    expect(entry('entry-3')).toMatchObject({
      hours: 42,
      minutes: 0,
      categoryId: undefined,
      credit: false,
      note: 'Cart',
    })
    expect(storedDayKey(entry('entry-3')!.date)).toBe('2026-10-20')

    expect(undoApplied(run.applied).result.status).toBe('undone')
    expect(entry('entry-3')).toMatchObject({
      hours: 1,
      minutes: 0,
      categoryId: 'category-bethel',
      credit: true,
      note: undefined,
    })
  })

  it('moves an entry to another month', () => {
    const fixture = fixtureContext(readScribeStores())
    propose(fixture, 'time_update', timeUpdate({ date: '2026-09-30' }))
    apply(proposalOf(fixture))
    expect(storedDayKey(entry('entry-3')!.date)).toBe('2026-09-30')
    expect(
      useServiceReport.getState().serviceReports[2026][8].map((e) => e.id)
    ).toEqual(['entry-3'])
  })

  it('deletes an entry, and Undo brings it back as it was', () => {
    const before = records()
    const fixture = fixtureContext(readScribeStores())
    propose(fixture, 'time_delete', { entryRef: null, onDate: '2026-10-20' })
    const run = apply(proposalOf(fixture))

    expect(run.result.status).toBe('applied')
    expect(entry('entry-3')).toBeUndefined()
    expect(
      useServiceReport
        .getState()
        .deletedServiceReports.map((tombstone) => tombstone.id)
    ).toContain('entry-3')

    expect(undoApplied(run.applied).result.status).toBe('undone')
    expect(records()).toEqual(before)
    expect(entry('entry-3')).toMatchObject({
      hours: 1,
      minutes: 0,
      categoryId: 'category-bethel',
      credit: true,
    })
    expect(storedDayKey(entry('entry-3')!.date)).toBe('2026-10-20')
    expect(
      useServiceReport
        .getState()
        .deletedServiceReports.map((tombstone) => tombstone.id)
    ).not.toContain('entry-3')
  })

  it('skips an entry that changed since it was proposed', () => {
    const fixture = fixtureContext(readScribeStores())
    propose(fixture, 'time_update', timeUpdate({ minutes: 90 }))
    propose(fixture, 'time_delete', { entryRef: null, onDate: '2026-10-14' })
    const proposal = proposalOf(fixture)
    const store = useServiceReport.getState()
    store.updateServiceReport({ ...entry('entry-3')!, minutes: 30 })
    store.deleteServiceReport(entry('entry-2')!)
    const run = apply(proposal)

    expect(
      run.proposal.effects.map((effect) => [effect.status, effect.skipReason])
    ).toEqual([
      ['skipped', 'changed'],
      ['skipped', 'missing'],
    ])
    expect(entry('entry-3')).toMatchObject({ hours: 1, minutes: 30 })
  })

  it('keeps a change the User edited since', () => {
    const fixture = fixtureContext(readScribeStores())
    propose(fixture, 'time_update', timeUpdate({ minutes: 90 }))
    const run = apply(proposalOf(fixture))
    useServiceReport
      .getState()
      .updateServiceReport({ ...entry('entry-3')!, note: 'Mine' })

    expect(undoApplied(run.applied).result).toEqual({
      status: 'partially_undone',
      kept: 1,
    })
    expect(entry('entry-3')).toMatchObject({ hours: 1, minutes: 30 })
  })
})

describe('Add, Dismiss and Undo from a conversation', () => {
  function stage() {
    const fixture = fixtureContext(readScribeStores(), {
      proposalId: 'pr_stage',
    })
    const contactRef = propose(
      fixture,
      'visits_log',
      visit({ newContact: { name: 'Ana Silva', address: null, phone: null } })
    )!
    propose(fixture, 'time_log', timeLog())
    const proposal = proposalOf(fixture)
    putConversation({
      ...newConversation('conversation', NOW.getTime(), 'Log Ana'),
      refs: structuredClone(fixture.refs.table),
      context: fixture.context,
      proposals: { [proposal.id]: proposal },
      pendingProposalId: proposal.id,
    })
    return { proposal, contactRef }
  }

  it('adds: records, an undo record, bound Refs and the outcome for the next message', () => {
    const { proposal, contactRef } = stage()
    const result = addScribeProposal(proposal.id, { now: NOW, newId })
    expect(result).toEqual({
      status: 'applied',
      appliedCards: 2,
      skippedCards: 0,
    })

    const conversation = getConversation('conversation')!
    expect(conversation.pendingProposalId).toBeNull()
    expect(conversation.proposals[proposal.id].status).toBe('applied')
    expect(conversation.outcomes).toEqual([
      expect.objectContaining({ proposalId: proposal.id, outcome: 'applied' }),
    ])
    const contact = useContacts
      .getState()
      .contacts.find((c) => c.name === 'Ana Silva')!
    expect(conversation.refs.byRef[contactRef]).toMatchObject({
      boundId: contact.id,
    })
    expect(getApplyRecord(proposal.id)?.effects).toHaveLength(3)
    expect(lastUserAction()?.kind).toBe('time')
    expect(capture).toHaveBeenCalledWith(
      'scribe_proposal_resolved',
      expect.objectContaining({
        outcome: 'applied',
        cards: 2,
        applied_cards: 2,
        kinds: 'contact.create,time.create,visit.create',
      })
    )
    // A second Add does nothing.
    expect(addScribeProposal(proposal.id).status).toBe('failed')
  })

  it('undoes from the toast, once', () => {
    const before = records()
    const { proposal, contactRef } = stage()
    addScribeProposal(proposal.id, { now: NOW, newId })
    expect(undoScribeProposalNow(proposal.id, 'toast')).toEqual({
      status: 'undone',
      kept: 0,
    })
    expect(records()).toEqual(before)

    const conversation = getConversation('conversation')!
    expect(conversation.proposals[proposal.id].status).toBe('undone')
    expect(
      conversation.proposals[proposal.id].cards.map((card) => card.status)
    ).toEqual(['undone', 'undone'])
    expect(conversation.outcomes.map((outcome) => outcome.outcome)).toEqual([
      'applied',
      'undone',
    ])
    expect(conversation.outcomes[0].created).toEqual([
      { callId: expect.any(String), ref: contactRef },
    ])
    expect(conversation.outcomes[1].created).toBeUndefined()
    expect(conversation.refs.byRef[contactRef]).toMatchObject({ boundId: null })
    expect(capture).toHaveBeenCalledWith('scribe_undo', {
      source: 'toast',
      target: 'scribe',
      result: 'undone',
    })
    expect(undoScribeProposalNow(proposal.id, 'history').status).toBe(
      'nothing_to_undo'
    )
  })

  it('points an added contact card at its Contact and Visit, while they last', () => {
    const { proposal } = stage()
    addScribeProposal(proposal.id, { now: NOW, newId })
    const view = () =>
      toScribeProposal(
        getConversation('conversation')!.proposals[proposal.id],
        readScribeStores(),
        getApplyRecord(proposal.id)?.effects
      )
    const contact = useContacts
      .getState()
      .contacts.find((c) => c.name === 'Ana Silva')!
    const visitId = useConversations
      .getState()
      .conversations.find((v) => v.contact.id === contact.id)!.id
    expect(view().cards.map((card) => card.target)).toEqual([
      { type: 'contact', contactId: contact.id, visitId },
      null,
    ])
    // Pending, and once undone, there's nothing to open.
    expect(
      toScribeProposal(proposal, readScribeStores()).cards.map((c) => c.target)
    ).toEqual([null, null])
    undoScribeProposalNow(proposal.id, 'conversation')
    expect(view().cards.map((card) => card.target)).toEqual([null, null])
  })

  it('counts records the User already deleted as undone', () => {
    const before = records()
    const { proposal } = stage()
    addScribeProposal(proposal.id, { now: NOW, newId })
    const entryId = getApplyRecord(proposal.id)!.effects.flatMap(({ undo }) =>
      undo.kind === 'time.create' ? [undo.entryId] : []
    )[0]
    useServiceReport
      .getState()
      .deleteServiceReport(
        allTimeEntries(useServiceReport.getState().serviceReports).find(
          (entry) => entry.id === entryId
        )!
      )

    expect(undoScribeProposalNow(proposal.id, 'conversation')).toEqual({
      status: 'undone',
      kept: 0,
    })
    expect(records()).toEqual(before)
    const stored = getConversation('conversation')!.proposals[proposal.id]
    expect(stored.status).toBe('undone')
    expect(stored.cards.map((card) => card.status)).toEqual([
      'undone',
      'undone',
    ])
    expect(stored.undoKept).toBe(0)
  })

  it('remembers what Undo kept, for the conversation to say', () => {
    const { proposal } = stage()
    addScribeProposal(proposal.id, { now: NOW, newId })
    const contact = useContacts
      .getState()
      .contacts.find((c) => c.name === 'Ana Silva')!
    useConversations.getState().addConversation({
      id: 'own-visit',
      contact: { id: contact.id },
      date: NOW,
    } as never)

    expect(undoScribeProposalNow(proposal.id, 'conversation')).toEqual({
      status: 'partially_undone',
      kept: 1,
    })
    const stored = getConversation('conversation')!.proposals[proposal.id]
    expect(stored.status).toBe('undone')
    expect(stored.undoKept).toBe(1)
    expect(toScribeProposal(stored, readScribeStores()).undoKept).toBe(1)
  })

  it('stays added, without Undo, when Undo had to keep everything', () => {
    const fixture = fixtureContext(readScribeStores(), {
      proposalId: 'pr_update',
    })
    propose(fixture, 'contacts_update', {
      contactRef: 'c1',
      name: null,
      phone: '555-0199',
      email: null,
      address: null,
    })
    const proposal = proposalOf(fixture)
    putConversation({
      ...newConversation('conversation', NOW.getTime(), 'Update'),
      refs: structuredClone(fixture.refs.table),
      context: fixture.context,
      proposals: { [proposal.id]: proposal },
      pendingProposalId: proposal.id,
    })
    addScribeProposal(proposal.id, { now: NOW, newId })
    const [{ undo }] = getApplyRecord(proposal.id)!.effects
    const contactId = undo.kind === 'contact.update' ? undo.contactId : ''
    // The User edits the Contact again.
    useContacts
      .getState()
      .updateContact({ id: contactId, phone: '555-0123', updatedAt: 1 })

    expect(undoScribeProposalNow(proposal.id, 'conversation')).toEqual({
      status: 'partially_undone',
      kept: 1,
    })
    const stored = getConversation('conversation')!.proposals[proposal.id]
    expect(stored.status).toBe('applied')
    expect(stored.undoKept).toBe(1)
    expect(getApplyRecord(proposal.id)).toBeNull()
    expect(
      useContacts.getState().contacts.find((c) => c.id === contactId)!.phone
    ).toBe('555-0123')
  })

  it('stops offering Undo after 30 days', () => {
    const { proposal } = stage()
    addScribeProposal(proposal.id, { now: NOW, newId })
    const later = NOW.getTime() + 31 * 86_400_000
    expect(undoScribeProposalNow(proposal.id, 'history', later).status).toBe(
      'nothing_to_undo'
    )
  })

  it('dismisses without writing', () => {
    const before = records()
    const { proposal } = stage()
    dismissScribeProposal(proposal.id, NOW)
    expect(records()).toEqual(before)
    const conversation = getConversation('conversation')!
    expect(conversation.proposals[proposal.id].status).toBe('dismissed')
    expect(conversation.outcomes).toEqual([
      expect.objectContaining({ outcome: 'dismissed', applied: [] }),
    ])
  })
})

// Stored calendar days drift at UTC+12 and beyond, where noon UTC is already
// the next local day (src/__tests__/storedDaysFarEast.test.ts).
describe('a date-only time entry far east', () => {
  const originalTZ = process.env.TZ
  afterEach(() => {
    if (originalTZ === undefined) delete process.env.TZ
    else process.env.TZ = originalTZ
  })

  it('stores it on its day and in its month', () => {
    for (const tz of [
      'Pacific/Auckland',
      'Pacific/Kiritimati',
      'UTC',
      'America/Los_Angeles',
      'Etc/GMT+12',
    ]) {
      process.env.TZ = tz
      useServiceReport.setState({ serviceReports: {} })
      const outcome = applyTimeCreate(
        {
          kind: 'time.create',
          date: '2026-08-31',
          minutes: 60,
          category: { type: 'standard' },
          note: null,
          spoken: { date: null, time: null },
        },
        { now: NOW, prefs: PREFERENCES, bound: new Map(), newId }
      )
      expect(outcome.status).toBe('applied')
      const aug = useServiceReport.getState().serviceReports[2026]?.[7] ?? []
      expect({
        tz,
        days: aug.map((entry) => storedDayKey(entry.date)),
      }).toEqual({ tz, days: ['2026-08-31'] })
    }
  })

  it('keeps Plans, Visits and Follow-ups on their days east and west', () => {
    for (const tz of [
      'Pacific/Kiritimati',
      'Asia/Tokyo',
      'UTC',
      'America/St_Johns',
      'Pacific/Honolulu',
      'Etc/GMT+12',
    ]) {
      process.env.TZ = tz
      seed()
      const ctx = { now: NOW, prefs: PREFERENCES, bound: new Map(), newId }
      applyPlanCreate(
        {
          kind: 'plan.create',
          date: '2026-08-31',
          minutes: 90,
          startMinutes: 18 * 60,
          anytime: false,
          category: { type: 'standard' },
          title: null,
          note: null,
          spoken: { date: null, time: null },
        },
        ctx
      )
      applyVisitCreate(
        {
          kind: 'visit.create',
          contact: { type: 'existing', id: 'contact-ben' },
          date: '2026-08-31',
          notAtHome: false,
          bibleStudy: true,
          note: null,
          followUp: {
            date: '2026-09-08',
            topic: null,
            spoken: { date: null, time: null },
          },
          spoken: { date: null, time: null },
        },
        ctx
      )
      const plan = useServiceReport.getState().dayPlans.at(-1)!
      const visit = useConversations.getState().conversations.at(-1)!
      const local = (date: Date | string | undefined) =>
        moment(date).format('YYYY-MM-DD')
      expect({
        tz,
        plan: storedDayKey(plan.date),
        start: plan.startTimeInMinutes,
        visit: local(visit.date),
        followUp: local(visit.followUp?.date),
      }).toEqual({
        tz,
        plan: '2026-08-31',
        start: 18 * 60,
        visit: '2026-08-31',
        followUp: '2026-09-08',
      })
    }
  })
})
