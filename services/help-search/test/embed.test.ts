import { describe, expect, it, vi } from 'vitest'
import { decodeVector, embedQuery, encodeVector, normalize } from '../src/embed'
import { mockAi } from './mocks'

describe('vectors', () => {
  it('normalizes to unit length', () => {
    expect([...normalize([3, 4])]).toEqual([
      0.6000000238418579, 0.800000011920929,
    ])
    expect([...normalize([0, 0])]).toEqual([0, 0])
  })
  it('round-trips through base64', () => {
    const vector = normalize(Array.from({ length: 768 }, (_, i) => Math.sin(i)))
    expect(decodeVector(encodeVector(vector))).toEqual(vector)
  })
})

describe('embedQuery', () => {
  it('returns the normalized query embedding', async () => {
    const { ai } = mockAi()
    const vector = await embedQuery(ai, 'dark mode', 1_000)
    expect(vector).toBeInstanceOf(Float32Array)
    expect(Math.hypot(...vector!)).toBeCloseTo(1)
  })
  it('gives up at the deadline', async () => {
    const { ai, run } = mockAi()
    run.mockImplementationOnce(() => new Promise(() => {}))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await embedQuery(ai, 'dark mode', 5)).toBeNull()
  })
  it('returns null when Workers AI fails, without logging the query', async () => {
    const { ai, run } = mockAi()
    run.mockRejectedValueOnce(
      new Error('3040: Capacity exceeded for: secret question')
    )
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await embedQuery(ai, 'secret question', 1_000)).toBeNull()
    expect(log).toHaveBeenCalledWith('query embedding failed', 'Error', '3040')
  })
})
