import { describe, expect, it } from 'vitest'
import { nextMenuIndex, typeaheadIndex } from '@/components/ui/web/menuKeys'

describe('nextMenuIndex', () => {
  it('moves down and up, wrapping at the ends', () => {
    expect(nextMenuIndex('ArrowDown', 0, 3)).toBe(1)
    expect(nextMenuIndex('ArrowDown', 2, 3)).toBe(0)
    expect(nextMenuIndex('ArrowUp', 0, 3)).toBe(2)
    expect(nextMenuIndex('ArrowUp', 2, 3)).toBe(1)
  })

  it('starts at the ends from no item', () => {
    expect(nextMenuIndex('ArrowDown', -1, 3)).toBe(0)
    expect(nextMenuIndex('ArrowUp', -1, 3)).toBe(2)
  })

  it('jumps to the first and last items', () => {
    expect(nextMenuIndex('Home', 2, 4)).toBe(0)
    expect(nextMenuIndex('End', 0, 4)).toBe(3)
  })

  it('ignores other keys and empty menus', () => {
    expect(nextMenuIndex('a', 0, 3)).toBeNull()
    expect(nextMenuIndex('ArrowDown', -1, 0)).toBeNull()
  })
})

describe('typeaheadIndex', () => {
  const labels = ['Edit', 'Duplicate', 'Delete']

  it('jumps to the next label that starts with the character', () => {
    expect(typeaheadIndex(labels, 0, 'd')).toBe(1)
    expect(typeaheadIndex(labels, 1, 'D')).toBe(2)
    expect(typeaheadIndex(labels, 2, 'd')).toBe(1)
  })

  it('finds nothing for other keys', () => {
    expect(typeaheadIndex(labels, 0, 'z')).toBeNull()
    expect(typeaheadIndex(labels, 0, 'Enter')).toBeNull()
    expect(typeaheadIndex(labels, 0, ' ')).toBeNull()
  })
})
