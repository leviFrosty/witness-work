import React, { type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  const i18n = new I18n({ en }, { locale: 'en' })
  return { default: i18n, _i18n: i18n }
})
vi.mock('react-native', async () => {
  const ReactModule = await import('react')
  return {
    Platform: {
      OS: 'ios',
      select: (options: { ios?: unknown }) => options.ios,
    },
    View: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement('View', null, children),
  }
})
vi.mock('lucide-react-native', () => ({ X: 'X' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    fonts: {},
    colors: {},
    numbers: { borderRadiusSm: 8 },
    fontSize: () => 14,
  }),
}))
vi.mock('@/lib/dates', () => ({ formatRelative: () => 'just now' }))
// The real one reads photos and Preferences; only the name matters here.
vi.mock('@/features/buddies/lib/buddyProfile', () => ({
  buddyDisplayName: (buddy: { name: string; nickname?: string }) =>
    buddy.nickname ?? buddy.name,
}))
const haptics = vi.hoisted(() => ({ success: vi.fn(async () => {}) }))
vi.mock('@/lib/haptics', () => ({ default: haptics }))

/** Leaf components as host elements, so their props can be read. */
const host = vi.hoisted(() => (name: string) => async () => {
  const ReactModule = await import('react')
  return {
    default: (props: { children?: ReactNode }) =>
      ReactModule.createElement(name, props, props.children),
  }
})
vi.mock('@/components/ui/ActionButton', host('ActionButton'))
vi.mock('@/components/ui/Button', host('Button'))
vi.mock('@/components/ui/ContextMenu', host('ContextMenu'))
vi.mock('@/components/ui/IconButton', host('IconButton'))
vi.mock('@/components/ui/MyText', host('Text'))
vi.mock('@/components/ui/layout/XView', host('XView'))
vi.mock('@/features/buddies/components/BuddyAvatar', host('BuddyAvatar'))

/** A promise the test settles. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const answers = vi.hoisted(() => ({
  joinCarInvite: vi.fn<(key: string) => Promise<boolean>>(),
  declineCarInvite: vi.fn<(key: string) => Promise<void>>(),
}))
vi.mock('@/app/sharedCars/answerCarInvite', () => answers)

import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import type { Buddy, BuddyNotification } from '@/features/buddies/lib/state'
import SharedCarNotificationRow, {
  type CarInviteAnswer,
} from '@/app/sharedCars/SharedCarNotificationRow'

const SHARE_KEY = 'anna|invite-1'

const entry: BuddyNotification = {
  id: 'event-1',
  kind: 'carInvite',
  at: 1,
  read: false,
  from: 'anna',
  name: 'Anna',
  shareKey: SHARE_KEY,
}

let renderer: ReactTestRenderer | undefined

function render(
  props: {
    answer?: CarInviteAnswer
    people?: number
    onDismiss?: () => void
    onJoined?: () => void
  } = {}
) {
  act(() => {
    renderer = create(
      <SharedCarNotificationRow
        entry={entry}
        answer={props.answer}
        people={props.people}
        car='Mazda CX-5'
        unread
        onDismiss={props.onDismiss}
        onJoined={props.onJoined ?? (() => {})}
      />
    )
  })
  return renderer!
}

type Pressable = { onPress: () => void; disabled?: boolean }

/** Everything the row says, in order. */
const texts = (tree: ReactTestRenderer) =>
  tree.root
    .findAll((node) => node.type === ('Text' as never))
    .flatMap((node) => React.Children.toArray(node.props.children))
    .filter((child): child is string => typeof child === 'string')

const joinButton = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => node.type === ('ActionButton' as never))[0]
    ?.props as (Pressable & { children: ReactNode }) | undefined
const declineButton = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => node.type === ('Button' as never))[0]?.props as
    | Pressable
    | undefined
const dismissButton = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => node.type === ('IconButton' as never))[0]
    ?.props as Pressable | undefined

beforeEach(() => {
  answers.joinCarInvite.mockReset()
  answers.declineCarInvite.mockReset()
  answers.declineCarInvite.mockResolvedValue(undefined)
  haptics.success.mockClear()
  useBuddies.setState({
    buddies: [
      {
        inboxId: 'anna',
        name: 'Anna',
        nickname: 'Annie',
        status: 'active',
      } as Buddy,
    ],
  })
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

describe('an invitation still to answer', () => {
  it('offers Join and Decline, with who’s on the car', () => {
    const tree = render({ answer: 'open', people: 2 })
    expect(joinButton(tree)?.children).toBe('Join')
    expect(texts(tree)).toContain('Decline')
    // By the User's name for the buddy, and the car's.
    expect(texts(tree)).toContain('Annie shared Mazda CX-5 with you')
    expect(texts(tree)).toContain('2 people · just now')
    expect(texts(tree)).not.toContain('You joined')
  })

  it('answers a fast double tap on Join once', async () => {
    const joining = deferred<boolean>()
    answers.joinCarInvite.mockReturnValue(joining.promise)
    const onJoined = vi.fn()
    const tree = render({ answer: 'open', onJoined })

    // Both taps land before the row draws again.
    act(() => {
      const join = joinButton(tree)!
      join.onPress()
      join.onPress()
    })
    expect(answers.joinCarInvite).toHaveBeenCalledExactlyOnceWith(SHARE_KEY)
    // Held while the first is on its way.
    expect(joinButton(tree)?.disabled).toBe(true)
    expect(declineButton(tree)?.disabled).toBe(true)
    act(() => declineButton(tree)!.onPress())
    expect(answers.declineCarInvite).not.toHaveBeenCalled()

    await act(async () => joining.resolve(true))
    expect(onJoined).toHaveBeenCalledTimes(1)
    expect(haptics.success).toHaveBeenCalledTimes(1)
    expect(joinButton(tree)?.disabled).toBe(false)
  })

  it('stays to answer again when joining fails', async () => {
    answers.joinCarInvite.mockResolvedValue(false)
    const onJoined = vi.fn()
    const tree = render({ answer: 'open', onJoined })
    await act(async () => joinButton(tree)!.onPress())
    expect(onJoined).not.toHaveBeenCalled()
    expect(haptics.success).not.toHaveBeenCalled()
    expect(joinButton(tree)?.disabled).toBe(false)
  })

  it('declines by its key', async () => {
    const tree = render({ answer: 'open' })
    await act(async () => declineButton(tree)!.onPress())
    expect(answers.declineCarInvite).toHaveBeenCalledExactlyOnceWith(SHARE_KEY)
    expect(answers.joinCarInvite).not.toHaveBeenCalled()
  })

  it('can’t be dismissed when no dismiss is given', () => {
    const tree = render({ answer: 'open' })
    expect(dismissButton(tree)).toBeUndefined()
  })
})

describe('an answered invitation', () => {
  it('reads as joined, with nothing to answer', () => {
    const tree = render({ answer: 'joined', onDismiss: () => {} })
    expect(texts(tree)).toContain('You joined')
    expect(joinButton(tree)).toBeUndefined()
    expect(texts(tree)).not.toContain('Decline')
  })

  it('reads as declined', () => {
    const tree = render({ answer: 'declined', onDismiss: () => {} })
    expect(texts(tree)).toContain('You declined')
    expect(joinButton(tree)).toBeUndefined()
  })

  it('can be dismissed with its X', () => {
    const onDismiss = vi.fn()
    const tree = render({ answer: 'joined', onDismiss })
    act(() => dismissButton(tree)!.onPress())
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
