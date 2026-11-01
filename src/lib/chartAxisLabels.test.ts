import { describe, expect, it } from 'vitest'
import { placeAxisLabels } from '@/lib/chartAxisLabels'

const months = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'].map((label, i) => ({
  key: label,
  label,
  position: (i + 0.5) / 6,
}))
const sized = (width: number) => months.map((m) => ({ ...m, width }))
const names = (placed: { label: string }[]) => placed.map((p) => p.label)

describe('placeAxisLabels', () => {
  it('keeps every label that has room', () => {
    const placed = placeAxisLabels(sized(30), { rowWidth: 300, gap: 6 })
    expect(names(placed)).toEqual(['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'])
    expect(placed[1].left).toBe(75 - 15)
  })

  it('skips labels evenly when the text is wider than their room', () => {
    expect(
      names(placeAxisLabels(sized(60), { rowWidth: 300, gap: 6 }))
    ).toEqual(['Sep', 'Nov', 'Jan'])
    expect(
      names(placeAxisLabels(sized(120), { rowWidth: 300, gap: 6 }))
    ).toEqual(['Sep', 'Jan'])
  })

  it('nudges the end labels inside the plot and its insets', () => {
    const placed = placeAxisLabels(sized(80), {
      rowWidth: 300,
      insetLeft: 10,
      gap: 6,
    })

    expect(placed[0].left).toBe(-10)
    const last = placeAxisLabels([{ ...months[5], width: 60 }], {
      rowWidth: 300,
      gap: 6,
    })[0]
    expect(last.left).toBe(240)
  })

  it('shows one label when only one fits', () => {
    expect(
      names(placeAxisLabels(sized(200), { rowWidth: 300, gap: 6 }))
    ).toEqual(['Sep'])
  })
})
