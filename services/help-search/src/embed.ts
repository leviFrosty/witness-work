import type { HelpEntry } from './contract'

/**
 * Workers AI embedding model for answers and queries. Multilingual (100+
 * languages), 768 dimensions, and quick: about 125 ms at p50 and 250 ms at p90
 * for a query, measured in October 2026, where qwen3-embedding-0.6b (what AI
 * Search used) took 400 ms at p50 and 2–6 s at p90. Changing it re-embeds every
 * answer on the next sync (the model is part of each entry's hash).
 */
export const EMBEDDING_MODEL = '@cf/google/embeddinggemma-300m'

/**
 * How long a search waits for the query embedding before answering from
 * keywords alone (uncached). Embeddings take about 125 ms at p50 and 250 ms at
 * p90.
 */
export const EMBED_DEADLINE_MS = 400

/** Answers per Workers AI call when indexing. */
export const EMBED_BATCH = 20

// EmbeddingGemma's retrieval prompts: the model was trained with them.
export const documentText = (entry: HelpEntry) =>
  `title: ${entry.question} | text: ${entry.plainText}`
export const queryText = (query: string) =>
  `task: search result | query: ${query}`

/** Scales a vector to length 1, so a dot product is the cosine similarity. */
export function normalize(values: ArrayLike<number>): Float32Array {
  const vector = Float32Array.from(values)
  let sum = 0
  for (const value of vector) sum += value * value
  const length = Math.sqrt(sum) || 1
  for (let i = 0; i < vector.length; i++) vector[i] /= length
  return vector
}

export async function embed(ai: Ai, texts: string[]): Promise<Float32Array[]> {
  const { data } = (await ai.run(EMBEDDING_MODEL, { text: texts })) as {
    data: number[][]
  }
  if (data?.length !== texts.length)
    throw new Error(`expected ${texts.length} embeddings, got ${data?.length}`)
  return data.map(normalize)
}

/**
 * The query's embedding, or null when Workers AI fails or takes longer than
 * `deadlineMs`; search then answers from keywords alone.
 */
export async function embedQuery(
  ai: Ai,
  query: string,
  deadlineMs: number
): Promise<Float32Array | null> {
  let timer: number | undefined
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      // Never the query: search text isn't logged.
      console.warn('query embedding missed the deadline')
      resolve(null)
    }, deadlineMs)
  })
  try {
    return await Promise.race([
      embed(ai, [queryText(query)]).then(([vector]) => vector),
      deadline,
    ])
  } catch (error) {
    // The error's name and Workers AI code only: a message could quote the
    // input, and search text isn't logged.
    const name = error instanceof Error ? error.name : 'error'
    const code = /\b\d{4}\b/.exec(String(error))?.[0] ?? ''
    console.error('query embedding failed', name, code)
    return null
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** Float32 vector ⇄ base64, how vectors are stored in KV. */
export function encodeVector(vector: Float32Array): string {
  const bytes = new Uint8Array(
    vector.buffer,
    vector.byteOffset,
    vector.byteLength
  )
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export function decodeVector(encoded: string): Float32Array {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Float32Array(bytes.buffer)
}
