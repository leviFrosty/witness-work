import type { HelpEntry } from './contract'

export const EMBEDDING_MODEL = '@cf/google/embeddinggemma-300m'

export const EMBED_DEADLINE_MS = 400

export const EMBED_BATCH = 20

export const documentText = (entry: HelpEntry) =>
  `title: ${entry.question} | text: ${entry.plainText}`
export const queryText = (query: string) =>
  `task: search result | query: ${query}`

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

export async function embedQuery(
  ai: Ai,
  query: string,
  deadlineMs: number
): Promise<Float32Array | null> {
  let timer: number | undefined
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
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
    const name = error instanceof Error ? error.name : 'error'
    const code = /\b\d{4}\b/.exec(String(error))?.[0] ?? ''
    console.error('query embedding failed', name, code)
    return null
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

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
