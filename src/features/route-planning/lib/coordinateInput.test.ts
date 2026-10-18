import { describe, expect, it } from 'vitest'
import { parseCoordinateInput } from '@/features/route-planning/lib/coordinateInput'

describe('parseCoordinateInput', () => {
  it.each([
    ['37.7749, -122.4194', 37.7749, -122.4194],
    ['37.7749,-122.4194', 37.7749, -122.4194],
    ['  37.7749 -122.4194 ', 37.7749, -122.4194],
    ['37,7749; -122,4194', 37.7749, -122.4194],
    ['37.7749° N, 122.4194° W', 37.7749, -122.4194],
    ['N 37.7749 W 122.4194', 37.7749, -122.4194],
    ['33.8688° S, 151.2093° E', -33.8688, 151.2093],
    ['122.4194° W, 37.7749° N', 37.7749, -122.4194],
    ['https://www.google.com/maps/@37.7749,-122.4194,15z', 37.7749, -122.4194],
    ['https://maps.apple.com/?ll=37.7749,-122.4194&q=Pin', 37.7749, -122.4194],
  ])('reads %s', (text, latitude, longitude) => {
    expect(parseCoordinateInput(text)).toEqual({ latitude, longitude })
  })

  it.each(['', 'Main St', '37.7749', '95, 10', '10, 200', '37.7, -122.4, 5'])(
    'rejects %s',
    (text) => {
      expect(parseCoordinateInput(text)).toBeNull()
    }
  )
})
