import { describe, expect, it } from 'vitest'
import { stackLayers } from '@/app/navigation/stackLayers'

const route = (key: string, presentation?: string) => ({ key, presentation })
const layersOf = (
  routes: ReturnType<typeof route>[],
  panels = true
): [string, string[], boolean][] =>
  stackLayers(routes, (r) => r.presentation, panels).map((layer) => [
    layer.kind,
    layer.routes.map((r) => r.key),
    layer.visible,
  ])

describe('stackLayers', () => {
  it('keeps pushed screens in one layer and shows only it', () => {
    expect(layersOf([route('root'), route('details')])).toEqual([
      ['screen', ['root', 'details'], true],
    ])
  })

  it('opens a modal as a panel over the screen under it on a wide window', () => {
    expect(layersOf([route('root'), route('form', 'modal')])).toEqual([
      ['screen', ['root'], true],
      ['panel', ['form'], true],
    ])
  })

  it('keeps screens pushed from a modal inside its panel', () => {
    expect(
      layersOf([route('root'), route('form', 'formSheet'), route('pick')])
    ).toEqual([
      ['screen', ['root'], true],
      ['panel', ['form', 'pick'], true],
    ])
  })

  it('shows only the top panel when one opens from another', () => {
    expect(
      layersOf([route('root'), route('visit', 'modal'), route('form', 'modal')])
    ).toEqual([
      ['screen', ['root'], true],
      ['panel', ['visit'], false],
      ['panel', ['form'], true],
    ])
  })

  it('covers the window with a modal on a narrow one', () => {
    expect(layersOf([route('root'), route('form', 'modal')], false)).toEqual([
      ['screen', ['root'], false],
      ['screen', ['form'], true],
    ])
  })

  it('hides everything under a full screen modal', () => {
    expect(
      layersOf([
        route('root'),
        route('form', 'modal'),
        route('note', 'fullScreenModal'),
      ])
    ).toEqual([
      ['screen', ['root'], false],
      ['panel', ['form'], false],
      ['screen', ['note'], true],
    ])
  })

  it('shows the screen under a transparent modal, and covers both with a push', () => {
    expect(
      layersOf([route('root'), route('voice', 'transparentModal')])
    ).toEqual([
      ['screen', ['root'], true],
      ['overlay', ['voice'], true],
    ])
    expect(
      layersOf([
        route('root'),
        route('voice', 'transparentModal'),
        route('history'),
      ])
    ).toEqual([
      ['screen', ['root'], false],
      ['overlay', ['voice'], false],
      ['screen', ['history'], true],
    ])
  })
})
