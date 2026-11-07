import { createElement, type ComponentType } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { ISLANDS, type IslandName } from './island'

for (const element of document.querySelectorAll<HTMLElement>('[data-island]')) {
  const Component = ISLANDS[element.dataset.island as IslandName] as
    | ComponentType<object>
    | undefined
  if (!Component) continue
  hydrateRoot(
    element,
    createElement(Component, JSON.parse(element.dataset.props ?? '{}'))
  )
}
