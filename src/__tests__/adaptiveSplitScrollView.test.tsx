import { createElement } from 'react'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const layout = vi.hoisted(() => ({ isWide: true }))
vi.mock('@/hooks/useAdaptiveLayout', () => ({
  default: () => ({ isWide: layout.isWide, contentMaxWidth: 1200 }),
}))
vi.mock('react-native', () => ({
  View: ({ children }: { children: ReactNode }) =>
    createElement('div', null, children),
}))
vi.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: ({
    children,
    scrollsToTop,
  }: {
    children: ReactNode
    scrollsToTop?: boolean
  }) =>
    createElement(
      'section',
      { 'data-scroll-to-top': scrollsToTop !== false },
      children
    ),
}))

import AdaptiveSplitScrollView from '@/components/ui/layout/AdaptiveSplitScrollView'

const renderLayout = () =>
  renderToStaticMarkup(
    createElement(AdaptiveSplitScrollView, {
      header: createElement('h1', null, 'Month navigation'),
      leading: createElement('span', null, 'Summary'),
      trailing: createElement('span', null, 'Records'),
      paddingBottom: 30,
    })
  )

describe('adaptive split scrolling', () => {
  beforeEach(() => {
    layout.isWide = true
  })

  it('places wide reference and record content in separate sibling scroll views', () => {
    const markup = renderLayout()
    expect(markup).toContain(
      '<section data-scroll-to-top="false"><span>Summary</span></section>'
    )
    expect(markup).toContain(
      '<section data-scroll-to-top="true"><span>Records</span></section>'
    )
    expect(markup.indexOf('Month navigation')).toBeLessThan(
      markup.indexOf('<section')
    )
    expect(markup.match(/<section/g)).toHaveLength(2)
  })

  it('keeps compact header, reference, and records in a single scroll view', () => {
    layout.isWide = false
    const markup = renderLayout()
    expect(markup).toBe(
      '<section data-scroll-to-top="true"><h1>Month navigation</h1><span>Summary</span><span>Records</span></section>'
    )
  })
})
