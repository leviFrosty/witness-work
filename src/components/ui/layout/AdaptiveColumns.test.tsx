import React, { useEffect, type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) =>
    React.createElement('view', null, children),
}))
vi.mock('@/components/ui/layout/FoldSplit', () => ({
  default: ({
    leading,
    trailing,
  }: {
    leading: ReactNode
    trailing?: ReactNode
  }) =>
    React.createElement(
      'row',
      null,
      React.createElement('leading', null, leading),
      trailing ? React.createElement('trailing', null, trailing) : null
    ),
}))

import AdaptiveColumns from '@/components/ui/layout/AdaptiveColumns'

const mounts: string[] = []
function Section({ name }: { name: string }) {
  useEffect(() => {
    mounts.push(name)
  }, [name])
  return React.createElement('section', { name })
}

const names = (node: ReturnType<ReactTestRenderer['toJSON']>, tag: string) => {
  const found: string[] = []
  const walk = (n: unknown, inside: boolean) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach((child) => walk(child, inside))
    const el = n as {
      type: string
      props: { name?: string }
      children: unknown
    }
    const within = inside || el.type === tag
    if (within && el.type === 'section' && el.props.name)
      found.push(el.props.name)
    walk(el.children, within)
  }
  walk(node, false)
  return found
}

describe('adaptive columns', () => {
  let renderer: ReactTestRenderer | undefined
  afterEach(() => {
    act(() => renderer?.unmount())
    mounts.length = 0
  })

  const render = (wide: boolean) => (
    <AdaptiveColumns wide={wide}>
      {['a', 'b', 'c', 'd'].map((name) => (
        <Section key={name} name={name} />
      ))}
    </AdaptiveColumns>
  )

  it('reads in order across two columns', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    act(() => {
      renderer = create(render(true))
    })
    const tree = renderer!.toJSON()
    expect([...names(tree, 'leading'), ...names(tree, 'trailing')]).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
    expect(names(tree, 'leading')).toEqual(['a', 'b'])
  })

  it('keeps the leading sections mounted as the trailing column comes and goes', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    act(() => {
      renderer = create(render(false))
    })
    expect(mounts).toEqual(['a', 'b', 'c', 'd'])
    act(() => renderer!.update(render(true)))

    expect(mounts.slice(4)).toEqual(['c', 'd'])
  })
})
