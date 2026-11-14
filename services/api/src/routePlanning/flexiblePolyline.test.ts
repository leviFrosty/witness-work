import { describe, expect, it } from 'vitest'
import { decodeFlexiblePolyline } from './flexiblePolyline'

describe('decodeFlexiblePolyline', () => {
  it('decodes the spec’s 2D example', () => {
    expect(decodeFlexiblePolyline('BFoz5xJ67i1B1B7PzIhaxL7Y')).toEqual([
      50.10228, 8.69821, 50.10201, 8.69567, 50.10063, 8.6915, 50.09878,
      8.68752,
    ])
  })

  it('drops a third dimension', () => {
    // The spec's 3D example: precision 5, altitude at precision 0.
    expect(
      decodeFlexiblePolyline('BVoz5xJ67i1BU1B7PUzIhaUxL7YU')
    ).toEqual([
      50.10228, 8.69821, 50.10201, 8.69567, 50.10063, 8.6915, 50.09878,
      8.68752,
    ])
  })

  it('refuses another version, unknown characters, and cut-short input', () => {
    expect(decodeFlexiblePolyline('CFoz5xJ67i1B')).toBeNull()
    expect(decodeFlexiblePolyline('BFoz5xJ67i1B*')).toBeNull()
    expect(decodeFlexiblePolyline('BFoz5xJ67i1B1')).toBeNull()
    expect(decodeFlexiblePolyline('')).toBeNull()
  })
})
