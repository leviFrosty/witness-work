import { describe, expect, it } from 'vitest'
import { rectFor } from '@/lib/mapsFrame/projection'
import { toHexColor } from '@/vendor/web/maps/color'
import {
  createOverlayLayout,
  markerPlacement,
} from '@/vendor/web/maps/overlayLayout'

const size = { width: 400, height: 300 }
const center = { latitude: 39.1, longitude: -84.5 }
const rect = rectFor(
  { ...center, latitudeDelta: 0.02, longitudeDelta: 0.02 },
  size
)
const node = () => ({ style: { transform: '', visibility: '' } })

describe('the overlay layout', () => {
  it('puts a centered view on its coordinate', () => {
    const layout = createOverlayLayout()
    const pin = node()
    layout.add({
      node: pin,
      coordinate: center,
      ...markerPlacement({ anchor: { x: 0.5, y: 0.5 } }),
      size: { width: 30, height: 30 },
    })
    expect(pin.style.visibility).toBe('hidden')
    layout.update(rect, size)
    expect(pin.style.visibility).toBe('visible')
    expect(pin.style.transform).toBe('translate(185px, 135px)')
  })

  it("puts a card's bottom edge on its coordinate", () => {
    const layout = createOverlayLayout()
    const card = node()
    layout.update(rect, size)
    layout.add({
      node: card,
      coordinate: center,
      ...markerPlacement({
        anchor: { x: 0.5, y: 1 },
        centerOffset: { x: 0, y: -40 },
      }),
      size: { width: 100, height: 80 },
    })
    expect(card.style.transform).toBe('translate(150px, 70px)')
  })

  it('moves views with the map, and hides those far outside it', () => {
    const layout = createOverlayLayout()
    const pin = node()
    layout.add({
      node: pin,
      coordinate: center,
      ...markerPlacement({}),
      size: { width: 20, height: 20 },
    })
    layout.update({ ...rect, x: rect.x + rect.width / 4 }, size)
    expect(pin.style.transform).toBe('translate(90px, 140px)')
    layout.update({ ...rect, x: rect.x + rect.width * 3 }, size)
    expect(pin.style.visibility).toBe('hidden')
  })

  it("stops moving a view once it's removed", () => {
    const layout = createOverlayLayout()
    const pin = node()
    const remove = layout.add({
      node: pin,
      coordinate: center,
      ...markerPlacement({}),
      size: { width: 20, height: 20 },
    })
    layout.update(rect, size)
    const before = pin.style.transform
    remove()
    layout.update({ ...rect, x: rect.x + rect.width / 4 }, size)
    expect(pin.style.transform).toBe(before)
  })

  it('centers a view and moves it by centerOffset without an anchor', () => {
    expect(markerPlacement({ centerOffset: { x: 2, y: -10 } })).toEqual({
      anchor: { x: 0.5, y: 0.5 },
      offset: { x: 2, y: -10 },
    })
  })
})

describe('toHexColor', () => {
  it('takes the theme’s color forms', () => {
    expect(toHexColor('#0A84FF')).toBe('#0a84ff')
    expect(toHexColor('#abc')).toBe('#aabbcc')
    expect(toHexColor('#0a84ffcc')).toBe('#0a84ff')
    expect(toHexColor('rgba(10, 132, 255, 0.5)')).toBe('#0a84ff')
    expect(toHexColor('rgb(300 0 0)')).toBe('#ff0000')
  })

  it('falls back for anything else', () => {
    expect(toHexColor('red')).toBe('#ff3b30')
    expect(toHexColor('url(x)', '#000000')).toBe('#000000')
    expect(toHexColor(undefined)).toBe('#ff3b30')
  })
})
