import { vi } from 'vitest'
import { tokenize } from '../src/text'

const DIMENSIONS = 64

/**
 * A stand-in embedding: hashed bag of words, so texts sharing words point the
 * same way. Good enough to rank a test query's answer first.
 */
export function fakeEmbedding(text: string): number[] {
  const vector: number[] = Array.from({ length: DIMENSIONS }, () => 0)
  // The retrieval prompts' own words would make every text alike.
  const body = text.replace(/^(title: |task: search result \| query: )/, '')
  for (const token of tokenize(body.replace(' | text: ', ' '))) {
    let hash = 0
    for (const char of token) hash = (hash * 31 + char.codePointAt(0)!) | 0
    vector[Math.abs(hash) % DIMENSIONS] += 1
  }
  return vector
}

/** In-memory stand-in for the Workers AI binding. */
export function mockAi() {
  const run = vi.fn(async (_model: string, input: { text: string[] }) => ({
    shape: [input.text.length, DIMENSIONS],
    data: input.text.map(fakeEmbedding),
  }))
  return { ai: { run } as unknown as Ai, run }
}

export function mockKv() {
  const store = new Map<string, string>()
  const kv = {
    get: vi.fn(async (key: string, options?: string | { type?: string }) => {
      const value = store.get(key)
      if (value === undefined) return null
      const type = typeof options === 'string' ? options : options?.type
      return type === 'json' ? JSON.parse(value) : value
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
  }
  return { kv: kv as unknown as KVNamespace, store }
}
