import type { PropsWithChildren } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  fail: false,
  Splash: () => null,
  App: () => null,
  Retry: (_: { onRetry: () => void }) => null,
  Pass: ({ children }: PropsWithChildren) => children,
}))

vi.mock('react-native', () => ({ View: runtime.Pass }))
vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
  _i18n: { locale: 'en-us' },
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))
vi.mock('@/features/updates/lib/helpCenter/locale', () => ({
  helpLocaleFor: () => 'en-US',
}))
vi.mock('@/features/updates/lib/helpCenter/snapshot', () => ({
  loadSnapshot: vi.fn(async () => {}),
}))
vi.mock('@/components/ui/InlineNotice', () => ({ default: runtime.Retry }))
vi.mock('@/app/launch/LaunchSplash', () => ({ default: runtime.Splash }))
vi.mock('@/app/web-sign-in/components/SignInPage', () => ({
  default: runtime.Pass,
}))
vi.mock('@/app/web-sign-in/WebSignInRoot', () => ({ default: runtime.Pass }))

let renderer: ReactTestRenderer | undefined
const flush = () => act(async () => {})

async function until<T>(check: () => T): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return check()
    } catch (error) {
      if (attempt > 50) throw error
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    }
  }
}

beforeEach(() => {
  vi.resetModules()
  vi.doMock('@/app/UnlockedApp', () => {
    if (runtime.fail) throw new Error('The chunk failed to load')
    return { default: runtime.App }
  })
  vi.stubGlobal('window', new EventTarget())
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.unstubAllGlobals()
})

it('loads the app at the first interaction, once', async () => {
  runtime.fail = false
  const { loadSnapshot } = await import(
    '@/features/updates/lib/helpCenter/snapshot'
  )
  vi.mocked(loadSnapshot).mockClear()
  const loader = await import('./UnlockedAppLoader.web')

  loader.preloadUnlockedAppOnInteraction()
  await flush()
  expect(loadSnapshot).not.toHaveBeenCalled()

  window.dispatchEvent(new Event('pointerdown'))
  window.dispatchEvent(new Event('keydown'))
  await flush()
  expect(loadSnapshot).toHaveBeenCalledTimes(1)

  await until(() => {
    act(() => {
      renderer = create(<loader.default />)
    })
    expect(renderer!.root.findAllByType(runtime.App)).toHaveLength(1)
  })
})

it('shows the splash while loading, then a retry if the app can’t load', async () => {
  runtime.fail = true
  const loader = await import('./UnlockedAppLoader.web')

  act(() => {
    renderer = create(<loader.default />)
  })
  expect(renderer!.root.findAllByType(runtime.Splash)).toHaveLength(1)
  const retry = await until(() => renderer!.root.findByType(runtime.Retry))

  runtime.fail = false
  await act(async () => retry.props.onRetry())
  await until(() =>
    expect(renderer!.root.findAllByType(runtime.App)).toHaveLength(1)
  )
})
