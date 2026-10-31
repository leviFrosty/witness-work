import React, { type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  const i18n = new I18n({ en }, { locale: 'en' })
  return { default: i18n, _i18n: i18n }
})
vi.mock('react-native', () => ({
  View: 'View',
  ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'ios' },
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    fonts: {},
    colors: { border: '#ddd', textAlt: '#666' },
    fontSize: () => 14,
  }),
}))

/** Leaf components as host elements, so their props can be read. */
const host = vi.hoisted(() => (name: string) => async () => {
  const ReactModule = await import('react')
  return {
    default: (props: { children?: ReactNode }) =>
      ReactModule.createElement(name, props, props.children),
  }
})
vi.mock('@/components/ui/Avatar', host('Avatar'))
vi.mock('@/components/ui/MyText', host('Text'))
vi.mock('@/components/ui/PointerTooltip', host('PointerTooltip'))
vi.mock('@/components/ui/PullDownMenu', host('PullDownMenu'))

import CarPersonRow from '@/app/sharedCars/CarPersonRow'
import type { ContextMenuAction } from '@/components/ui/ContextMenu.types'

let renderer: ReactTestRenderer | undefined

const leave: ContextMenuAction = {
  id: 'leave',
  title: 'Leave Car…',
  onPress: () => {},
}

function render(props: Partial<React.ComponentProps<typeof CarPersonRow>>) {
  act(() => {
    renderer = create(
      <CarPersonRow
        name='Ana'
        avatar={{ type: 'none', value: '' }}
        subtitle='Owner'
        actions={[leave]}
        last={false}
        {...props}
      />
    )
  })
  return renderer!
}

/** Every element a screen reader stops on: accessible views and controls. */
const stops = (tree: ReactTestRenderer) =>
  tree.root.findAll(
    (node) =>
      (node.type === ('View' as never) && node.props.accessible === true) ||
      node.type === ('PullDownMenu' as never)
  )

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

describe('a person in a car’s People', () => {
  it('reads the person as one stop and their menu as the next', () => {
    const tree = render({})
    const [person, menu] = stops(tree)

    expect(stops(tree)).toHaveLength(2)
    expect(person.props.accessibilityLabel).toBe('Ana, Owner')
    // Their name and line sit inside the one stop, with nothing else.
    expect(
      person
        .findAll((node) => node.type === ('Text' as never))
        .map((node) => node.props.children)
    ).toEqual(['Ana', 'Owner'])
    expect(menu.props).toMatchObject({
      accessibilityLabel: 'Actions for Ana',
      actions: [leave],
    })
    expect(
      person.findAll((node) => node.type === ('PullDownMenu' as never))
    ).toHaveLength(0)
  })

  it('doesn’t make the whole row one element', () => {
    const tree = render({})
    const row = tree.root.findAll((node) => node.type === ('View' as never))[0]
    expect(row.props.accessible).toBeUndefined()
  })

  it('reads just the name without a line under it', () => {
    const [person] = stops(render({ subtitle: undefined }))
    expect(person.props.accessibilityLabel).toBe('Ana')
  })

  it('stays one stop with nothing to do about them', () => {
    const tree = render({ actions: [] })
    expect(stops(tree)).toHaveLength(1)
    expect(stops(tree)[0].props.accessibilityLabel).toBe('Ana, Owner')
  })

  it('shows a spinner in place of the menu while an action runs', () => {
    const tree = render({ busy: true })
    expect(
      tree.root.findAll((node) => node.type === ('PullDownMenu' as never))
    ).toHaveLength(0)
    expect(
      tree.root.find((node) => node.type === ('ActivityIndicator' as never))
        .props.accessibilityLabel
    ).toBe('Loading')
  })
})
