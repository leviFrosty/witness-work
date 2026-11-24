import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const openURL = vi.hoisted(() => vi.fn())

vi.mock('react-native', () => ({
  View: 'View',
}))
vi.mock('@/lib/links', () => ({ openURL }))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/features/supporter/components/SupporterCtaButton', () => ({
  default: 'SupporterCtaButton',
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: new Proxy({}, { get: () => '#000' }),
    fonts: new Proxy({}, { get: () => 'font' }),
    fontSize: () => 14,
  }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/constants/links', () => ({
  default: {
    termsOfUse: 'https://witnesswork.app/terms',
    privacyPolicy: 'https://witnesswork.app/privacy',
  },
}))

import PaywallPurchaseFooter, {
  PaywallLegalFooter,
} from '@/features/supporter/components/PaywallPurchaseFooter'

let renderer: ReactTestRenderer | undefined
const render = (props: Partial<Parameters<typeof PaywallPurchaseFooter>[0]>) =>
  act(() => {
    renderer = create(
      <PaywallPurchaseFooter
        selected={false}
        tier='supporter'
        ctaLabel='Become a Supporter'
        onPurchase={() => {}}
        {...props}
      />
    )
  })
const texts = () =>
  renderer!.root
    .findAllByType('Text' as never)
    .map((node) => node.props.children)
const signIn = () =>
  renderer!.root
    .findAllByType('Button' as never)
    .filter((button) =>
      button
        .findAllByType('Text' as never)
        .some((text) => text.props.children === 'paywallSignInToBuyWebAction')
    )

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
})
afterEach(() => {
  act(() => renderer?.unmount())
  vi.unstubAllGlobals()
})

describe('PaywallPurchaseFooter', () => {
  it('offers sign-in under the reason Buy waits, with a 44pt target', () => {
    const onSignIn = vi.fn()
    render({ unavailableReason: 'paywallSignInToBuyWeb', onSignIn })
    expect(texts()).toContain('paywallSignInToBuyWeb')
    const [button] = signIn()
    expect(button.props.accessibilityRole).toBe('button')
    expect(button.props.style).toMatchObject({ minHeight: 44, minWidth: 44 })
    act(() => button.props.onPress())
    expect(onSignIn).toHaveBeenCalledOnce()
  })

  it('shows only the reason without a sign-in action', () => {
    render({ unavailableReason: 'paywallGettingAccountReadyWeb' })
    expect(texts()).toContain('paywallGettingAccountReadyWeb')
    expect(signIn()).toHaveLength(0)
  })

  it('shows the reassurance line, and no sign-in, when Buy is available', () => {
    render({ selected: true, onSignIn: vi.fn() })
    expect(texts()).toContain('paywallCtaReassuranceSupporter')
    expect(signIn()).toHaveLength(0)
  })
})

describe('PaywallLegalFooter', () => {
  it('opens Terms of Use and Privacy Policy through openURL', () => {
    openURL.mockReset()
    act(() => {
      renderer = create(
        <PaywallLegalFooter onRestore={vi.fn()} showRestore={false} />
      )
    })
    const buttons = renderer!.root.findAllByType('Button' as never)
    act(() => buttons[0].props.onPress())
    act(() => buttons[1].props.onPress())
    expect(openURL).toHaveBeenNthCalledWith(1, 'https://witnesswork.app/terms')
    expect(openURL).toHaveBeenNthCalledWith(
      2,
      'https://witnesswork.app/privacy'
    )
  })
})
