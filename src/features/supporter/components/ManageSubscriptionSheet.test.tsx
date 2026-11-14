import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => {
  vi.stubGlobal('__DEV__', false)
  return {
    platform: 'ios' as 'ios' | 'android' | 'web',
    hook: {} as Record<string, unknown>,
    pause: vi.fn(),
    openStore: vi.fn(),
    trackCancelTapped: vi.fn(),
    setOpen: vi.fn(),
    survey: {} as Record<string, unknown>,
    openSurvey: vi.fn(),
    finishSurvey: vi.fn(),
  }
})
vi.mock('react-native', () => ({ View: 'View' }))
vi.mock('@/components/ui/Sheet', () => ({ default: 'Sheet' }))
vi.mock('@/components/ui/Spinner', () => ({ default: 'Spinner' }))
vi.mock('@/components/ui/InlineNotice', () => ({ default: 'InlineNotice' }))
vi.mock('lucide-react-native', () => ({
  Check: 'Check',
  MessageSquareText: 'MessageSquareText',
  CreditCard: 'CreditCard',
  ExternalLink: 'ExternalLink',
  HeartOff: 'HeartOff',
  X: 'X',
}))
vi.mock('@/components/ui/DirectionalIcon', () => ({
  ChevronForwardIcon: 'ChevronForward',
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: {}, fonts: {}, numbers: {}, fontSize: () => 14 }),
}))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/IconButton', () => ({ default: 'IconButton' }))
vi.mock('@/components/ui/InfoPopover', () => ({ default: 'InfoPopover' }))
vi.mock('@/components/ui/layout/XView', () => ({ default: 'XView' }))
vi.mock('@/components/ui/inputs/Section', () => ({ default: 'Section' }))
vi.mock('@/components/ui/inputs/InputRowButton', () => ({
  default: 'InputRowButton',
}))
vi.mock('@/components/ui/inputs/DetailRow', () => ({ default: 'DetailRow' }))
vi.mock('@/components/ui/inputs/InputLayout', () => ({
  inputLayout: { contentMaxWidth: 680, horizontalPadding: 16 },
}))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  },
}))
vi.mock('@/lib/dates', () => ({
  formatDate: (date: Date | string) =>
    new Date(date).toISOString().slice(0, 10),
}))
vi.mock('posthog-react-native', () => ({
  PostHogProvider: 'PostHogProvider',
  SurveyModal: 'SurveyModal',
}))
vi.mock('@/lib/analytics', () => ({ surveyClient: {} }))
vi.mock('@/lib/surveySdk', () => ({ surveyAppearance: () => ({}) }))
vi.mock('@/features/supporter/hooks/useCancelSurvey', () => ({
  default: () => ({
    available: false,
    sent: false,
    opened: null,
    open: runtime.openSurvey,
    shown: vi.fn(),
    finish: runtime.finishSurvey,
    ...runtime.survey,
  }),
}))
vi.mock('@/features/supporter/hooks/useManageSubscription', () => ({
  get storePlatform() {
    return runtime.platform
  },
  default: () => ({
    canManage: true,
    pausingMonths: null,
    productLoaded: true,
    productError: null,
    pause: runtime.pause,
    openStore: runtime.openStore,
    trackCancelTapped: runtime.trackCancelTapped,
    ...runtime.hook,
  }),
}))

const sub = { productIdentifier: 'jwtime_499_1mo', expiresDate: '2026-11-01' }
const offer = (months: number) => ({
  months,
  discount: { identifier: `${months}` },
})
const renewing = (pause: unknown) => ({
  kind: 'renewing',
  sub,
  renewsAt: new Date(sub.expiresDate),
  pause,
})
const withOffers = renewing({
  kind: 'offers',
  offers: [offer(1), offer(3), offer(6)],
})

let tree: ReactTestRenderer
const render = async () => {
  const { default: ManageSubscriptionSheet } = await import(
    '@/features/supporter/components/ManageSubscriptionSheet'
  )
  await act(async () => {
    tree = create(
      <ManageSubscriptionSheet
        open
        setOpen={runtime.setOpen}
        source='settings'
      />
    )
  })
}
const texts = () =>
  tree.root
    .findAll((node) => (node.type as unknown) === 'Text')
    .map((node) => node.props.children)
    .flat()
    .filter((child): child is string => typeof child === 'string')
const rows = () =>
  tree.root.findAll((node) => (node.type as unknown) === 'InputRowButton')
const labels = () => rows().map((row) => row.props.label as string)
const row = (label: string) =>
  tree.root.find(
    (node) =>
      (node.type as unknown) === 'InputRowButton' && node.props.label === label
  )
const pauseRows = () =>
  rows().filter((r) => String(r.props.label).startsWith('manageSupport_pause'))
const sheet = () => tree.root.findByType('Sheet' as never)
const press = async (label: string) => {
  await act(async () => row(label).props.onPress())
}
const closeSheet = async () => {
  await act(async () => sheet().props.onClosed())
}

describe('ManageSubscriptionSheet', () => {
  beforeEach(() => {
    vi.resetModules()
    runtime.platform = 'ios'
    runtime.hook = {}
    runtime.survey = {}
  })
  afterEach(() => vi.clearAllMocks())

  it('keeps the pause offers back until the Supporter chooses to cancel', async () => {
    runtime.hook = { state: withOffers }
    await render()
    expect(labels()).toEqual([
      'manageSupport_changePlan',
      'manageSupport_cancel',
    ])
    expect(pauseRows()).toHaveLength(0)
    expect(texts()).not.toContain('manageSupport_lastThingTitle')
    const status = tree.root.findByType('DetailRow' as never)
    expect(status.props).toMatchObject({
      label: 'manageSupport_renewsLabel',
      value: '2026-11-01',
    })
  })

  it('offers each App Store pause as one last thing before cancelling', async () => {
    runtime.hook = { state: withOffers }
    await render()
    await press('manageSupport_cancel')

    expect(runtime.trackCancelTapped).toHaveBeenCalledWith(true, false)
    expect(runtime.setOpen).not.toHaveBeenCalled()
    expect(texts()).toContain('manageSupport_lastThingTitle')
    expect(pauseRows()).toHaveLength(3)
    expect(pauseRows()[1].props).toMatchObject({
      label: 'manageSupport_pauseFor {"count":3}',
      sublabel: 'manageSupport_nextPayment {"date":"2027-02-01"}',
    })
    await act(async () => pauseRows()[1].props.onPress())
    expect(runtime.pause).toHaveBeenCalledWith(offer(3))
  })

  it('still lets the Supporter go on to cancel after the offer', async () => {
    runtime.hook = { state: withOffers }
    await render()
    await press('manageSupport_cancel')
    await press('manageSupport_continueCancel')
    expect(runtime.setOpen).toHaveBeenCalledWith(false)
    expect(runtime.openStore).not.toHaveBeenCalled()
    await closeSheet()
    expect(runtime.openStore).toHaveBeenCalledWith('cancel')
    expect(labels()).toContain('manageSupport_cancel')
  })

  it('goes straight to the store when there is no pause to offer', async () => {
    runtime.hook = {
      state: renewing({ kind: 'unavailable', reason: 'no_offers' }),
    }
    await render()
    await press('manageSupport_cancel')
    expect(runtime.trackCancelTapped).toHaveBeenCalledWith(false, false)
    expect(texts()).not.toContain('manageSupport_lastThingTitle')
    await closeSheet()
    expect(runtime.openStore).toHaveBeenCalledWith('cancel')
  })

  it('opens the store to change the plan', async () => {
    runtime.hook = { state: withOffers }
    await render()
    await press('manageSupport_changePlan')
    expect(runtime.trackCancelTapped).not.toHaveBeenCalled()
    await closeSheet()
    expect(runtime.openStore).toHaveBeenCalledWith('manage')
  })

  it('waits for the pause options before cancel can be chosen', async () => {
    runtime.hook = { productLoaded: false, state: withOffers }
    await render()
    expect(row('manageSupport_cancel').props.disabled).toBe(true)
    expect(row('manageSupport_changePlan').props.disabled).toBeUndefined()
  })

  it('offers a retry when the pause options failed to load', async () => {
    const retryProduct = vi.fn()
    runtime.hook = {
      productError: 'offline',
      retryProduct,
      state: renewing({ kind: 'unavailable', reason: 'no_offers' }),
    }
    await render()
    await press('manageSupport_cancel')
    const notice = tree.root.findByType('InlineNotice' as never)
    expect(notice.props).toMatchObject({
      tone: 'offline',
      message: 'manageSupport_pauseLoadFailed',
    })
    notice.props.onRetry()
    expect(retryProduct).toHaveBeenCalledOnce()
    expect(row('manageSupport_continueCancel').props.disabled).toBe(false)
  })

  it('hands Android pauses to Google Play with its own wording', async () => {
    runtime.platform = 'android'
    runtime.hook = { state: renewing({ kind: 'play' }) }
    await render()
    expect(texts()).toContain('manageSupport_storeHintAndroid')
    expect(labels()).not.toContain('manageSupport_playPause')
    await press('manageSupport_cancel')
    expect(texts()).toEqual(
      expect.arrayContaining([
        'manageSupport_lastThingTitle',
        'manageSupport_pauseDescriptionAndroid',
        'manageSupport_storeHintAndroid',
      ])
    )
    expect(texts()).not.toContain('manageSupport_storeHint')
    expect(row('manageSupport_playPause').props.sublabel).toBe(
      'manageSupport_playPauseDetail'
    )
    await press('manageSupport_playPause')
    await closeSheet()
    expect(runtime.openStore).toHaveBeenCalledWith('pause')
  })

  it('tells a Supporter when they can pause again', async () => {
    runtime.hook = {
      state: renewing({
        kind: 'unavailable',
        reason: 'cooldown',
        availableAgainAt: new Date('2027-03-01'),
      }),
    }
    await render()
    expect(texts()).toContain(
      'manageSupport_pauseAgainAfter {"date":"2027-03-01"}'
    )
    expect(pauseRows()).toHaveLength(0)
  })

  it('locks the sheet while the App Store sheet is up', async () => {
    runtime.hook = {
      state: renewing({ kind: 'offers', offers: [offer(1), offer(3)] }),
    }
    await render()
    await press('manageSupport_cancel')
    runtime.hook = {
      pausingMonths: 3,
      state: renewing({ kind: 'offers', offers: [offer(1), offer(3)] }),
    }
    await act(async () => {
      tree.update(
        React.createElement(
          (
            await import(
              '@/features/supporter/components/ManageSubscriptionSheet'
            )
          ).default,
          { open: true, setOpen: runtime.setOpen, source: 'settings' }
        )
      )
    })
    expect(row('manageSupport_continueCancel').props.disabled).toBe(true)
    expect(pauseRows().map((r) => r.props.disabled)).toEqual([true, false])
    expect(sheet().props.dismissible).toBe(false)
    sheet().props.onOpenChange(false)
    expect(runtime.setOpen).not.toHaveBeenCalled()
  })

  it('shows the pause and offers no second pause once paused', async () => {
    runtime.hook = {
      state: { kind: 'paused', sub, resumesAt: new Date('2027-02-01') },
    }
    await render()
    expect(tree.root.findByType('DetailRow' as never).props).toMatchObject({
      label: 'manageSupport_resumesLabel',
      value: '2027-02-01',
    })
    expect(texts()).toContain('manageSupport_pausedFooter')
    await press('manageSupport_cancel')
    expect(runtime.trackCancelTapped).toHaveBeenCalledWith(false, false)
    await closeSheet()
    expect(runtime.openStore).toHaveBeenCalledWith('cancel')
  })

  it('offers only the store once renewal is off', async () => {
    runtime.hook = {
      state: { kind: 'ending', sub, endsAt: new Date(sub.expiresDate) },
    }
    await render()
    expect(labels()).toEqual(['manageSupport_manageInStore'])
    expect(texts()).toContain('manageSupport_endingFooter')
  })

  it("opens the store's own sheet only once this one has closed", async () => {
    runtime.hook = { state: { kind: 'none' } }
    await render()
    expect(sheet().props.dismissible).toBe(true)

    await press('manageSupport_manageInStore')
    expect(runtime.setOpen).toHaveBeenCalledWith(false)
    expect(runtime.openStore).not.toHaveBeenCalled()

    await closeSheet()
    expect(runtime.openStore).toHaveBeenCalledWith('manage')

    runtime.openStore.mockClear()
    sheet().props.onOpenChange(false)
    await closeSheet()
    expect(runtime.openStore).not.toHaveBeenCalled()
  })

  describe('the optional survey', () => {
    it('sits beside the pause offers once cancel is chosen', async () => {
      runtime.survey = { available: true }
      runtime.hook = { state: withOffers }
      await render()
      expect(labels()).not.toContain('manageSupport_survey')
      await press('manageSupport_cancel')
      expect(runtime.trackCancelTapped).toHaveBeenCalledWith(true, true)
      expect(labels()).toEqual([
        'manageSupport_pauseFor {"count":1}',
        'manageSupport_pauseFor {"count":3}',
        'manageSupport_pauseFor {"count":6}',
        'manageSupport_survey',
        'manageSupport_continueCancel',
      ])
      await press('manageSupport_survey')
      expect(runtime.openSurvey).toHaveBeenCalledOnce()
    })

    it('is offered on its own when there is no pause to offer', async () => {
      runtime.survey = { available: true }
      runtime.hook = {
        state: { kind: 'paused', sub, resumesAt: new Date('2027-02-01') },
      }
      await render()
      await press('manageSupport_cancel')
      expect(runtime.trackCancelTapped).toHaveBeenCalledWith(false, true)
      expect(runtime.setOpen).not.toHaveBeenCalled()
      expect(texts()).toContain('manageSupport_surveyOnlyDescription')
      expect(labels()).toEqual([
        'manageSupport_survey',
        'manageSupport_continueCancel',
      ])
    })

    it('says thanks once sent and keeps the step open', async () => {
      runtime.survey = { available: true }
      runtime.hook = {
        state: renewing({ kind: 'unavailable', reason: 'cooldown' }),
      }
      await render()
      await press('manageSupport_cancel')
      runtime.survey = { available: false, sent: true }
      await act(async () => {
        tree.update(
          React.createElement(
            (
              await import(
                '@/features/supporter/components/ManageSubscriptionSheet'
              )
            ).default,
            { open: true, setOpen: runtime.setOpen, source: 'settings' }
          )
        )
      })
      expect(labels()).toEqual([
        'manageSupport_surveySent',
        'manageSupport_continueCancel',
      ])
      expect(row('manageSupport_surveySent').props.onPress).toBeUndefined()
    })

    it('shows the survey over the sheet and locks the sheet meanwhile', async () => {
      const surveyDefinition = { id: 'lapse', appearance: null }
      runtime.survey = {
        available: true,
        opened: { survey: surveyDefinition, matchedKey: null },
      }
      runtime.hook = { state: withOffers }
      await render()
      const modal = tree.root.findByType('SurveyModal' as never)
      expect(modal.props.survey).toBe(surveyDefinition)
      expect(sheet().props.dismissible).toBe(false)
      sheet().props.onOpenChange(false)
      expect(runtime.setOpen).not.toHaveBeenCalled()
      modal.props.onClose(true)
      expect(runtime.finishSurvey).toHaveBeenCalledWith(true)
    })

    it('is not offered once renewal is off', async () => {
      runtime.survey = { available: true }
      runtime.hook = {
        state: { kind: 'ending', sub, endsAt: new Date(sub.expiresDate) },
      }
      await render()
      expect(labels()).toEqual(['manageSupport_manageInStore'])
    })
  })

  describe('on the web', () => {
    beforeEach(() => {
      runtime.platform = 'web'
    })
    const webSub = { ...sub, productIdentifier: 'web_jwtime_499_1mo' }

    it('says Manage, opens the page from the press itself, and offers no pause', async () => {
      runtime.hook = {
        managementUrl: 'https://pay.rev.cat/manage/abc',
        state: {
          kind: 'renewing',
          sub: { ...webSub, store: 'RC_BILLING' },
          renewsAt: new Date('2026-11-01'),
          pause: { kind: 'unavailable', reason: 'unsupported_plan' },
        },
      }
      await render()
      expect(labels()).toEqual([
        'manageSupport_manageWeb',
        'manageSupport_cancel',
      ])
      expect(texts()).toContain('manageSupport_storeHintWeb')
      act(() => row('manageSupport_cancel').props.onPress())

      expect(texts()).not.toContain('manageSupport_lastThingTitle')
      expect(runtime.openStore).toHaveBeenCalledWith('cancel')
      expect(runtime.setOpen).toHaveBeenCalledWith(false)
    })

    it.each([
      [
        'https://apps.apple.com/account/subscriptions',
        'manageSupport_storeHint',
        'manageSupport_billingIssue',
      ],
      [
        'https://play.google.com/store/account/subscriptions',
        'manageSupport_storeHintAndroid',
        'manageSupport_billingIssueAndroid',
      ],
      [
        'https://pay.rev.cat/manage/abc',
        'manageSupport_storeHintWeb',
        'manageSupport_billingIssueWeb',
      ],
    ])(
      'names the page %s opens, whatever the subscription’s store',
      async (managementUrl, hint, billingIssue) => {
        runtime.hook = {
          managementUrl,
          state: {
            kind: 'renewing',

            sub: { ...sub, store: 'RC_BILLING', billingIssuesDetectedAt: 1 },
            renewsAt: new Date('2026-11-01'),
            pause: { kind: 'unavailable', reason: 'billing_issue' },
          },
        }
        await render()
        expect(labels()).toContain('manageSupport_manageWeb')
        expect(texts()).toContain(hint)
        expect(texts()).toContain(billingIssue)
      }
    )

    it('hides Manage when there’s no page to open', async () => {
      runtime.hook = {
        canManage: false,
        state: {
          kind: 'ending',
          sub: { ...webSub, store: 'RC_BILLING' },
          endsAt: new Date('2026-11-01'),
        },
      }
      await render()
      expect(rows()).toHaveLength(0)
    })
  })
})
