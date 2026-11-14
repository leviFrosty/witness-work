import { describe, expect, it } from 'vitest'
import { droppedIndex, moveItem } from '@/lib/reorder'

describe('moveItem', () => {
  it('moves an item without disturbing the rest', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 3)).toEqual(['b', 'c', 'd', 'a'])
  })
})

describe('droppedIndex', () => {
  const order = ['a', 'b', 'c', 'd']
  const drop = (from: number, destination: number) => {
    const move = droppedIndex([from], destination)
    return move ? moveItem(order, move.from, move.to) : order
  }

  it('turns SwiftUI drop gaps into final positions', () => {
    expect(drop(0, 4)).toEqual(['b', 'c', 'd', 'a'])
    expect(drop(0, 2)).toEqual(['b', 'a', 'c', 'd'])
    expect(drop(3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(drop(2, 1)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('ignores drops that put the row back', () => {
    expect(droppedIndex([1], 1)).toBeNull()
    expect(droppedIndex([1], 2)).toBeNull()
    expect(droppedIndex([], 0)).toBeNull()
  })
})
