export type ByteRange = { start: number; end: number }

export function parseRange(
  header: string,
  size: number
): ByteRange | 'unsatisfiable' | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, first, last] = match
  if (!first && !last) return null
  if (!first) {
    const length = Number(last)
    if (length === 0 || size === 0) return 'unsatisfiable'
    return { start: Math.max(0, size - length), end: size - 1 }
  }
  const start = Number(first)
  const end = last ? Math.min(Number(last), size - 1) : size - 1
  if (last && Number(last) < start) return null
  if (start >= size) return 'unsatisfiable'
  return { start, end }
}

export async function partialResponse(
  header: string,
  response: Response
): Promise<Response> {
  if (response.status !== 200 || response.headers.has('Content-Encoding'))
    return new Response(response.body, response)
  const bytes = await response.arrayBuffer()
  const size = bytes.byteLength
  const range = parseRange(header, size)
  const headers = new Headers(response.headers)
  headers.set('Accept-Ranges', 'bytes')
  if (range === null) return new Response(bytes, { status: 200, headers })
  if (range === 'unsatisfiable') {
    headers.set('Content-Range', `bytes */${size}`)
    headers.delete('Content-Length')
    return new Response(null, { status: 416, headers })
  }
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
  headers.set('Content-Length', String(range.end - range.start + 1))
  return new Response(bytes.slice(range.start, range.end + 1), {
    status: 206,
    headers,
  })
}
