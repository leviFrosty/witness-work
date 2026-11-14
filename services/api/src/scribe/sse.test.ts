import { describe, expect, it, vi } from 'vitest'
import { SSE_HEARTBEAT, createSseWriter, sseFrame } from './sse'

const read = async (stream: ReadableStream<Uint8Array>) => new Response(stream).text()

describe('sseFrame', () => {
  it('names the event and repeats its type in data', () => {
    expect(sseFrame({ type: 'text', delta: 'Hi' } as never)).toBe(
      'event: text\ndata: {"type":"text","delta":"Hi"}\n\n'
    )
  })
})

describe('createSseWriter', () => {
  it('writes events in order and closes', async () => {
    const writer = createSseWriter()
    const text = read(writer.readable)
    void writer.send({ type: 'start' } as never)
    void writer.send({ type: 'text', delta: 'a' } as never)
    await writer.close()
    expect(await text).toBe(
      'event: start\ndata: {"type":"start"}\n\nevent: text\ndata: {"type":"text","delta":"a"}\n\n'
    )
  })

  it('sends a comment heartbeat on its interval until closed', async () => {
    let tick: (() => void) | null = null
    const clearInterval = vi.fn()
    const writer = createSseWriter({
      setInterval: ((fn: () => void, ms: number) => {
        expect(ms).toBe(15_000)
        tick = fn
        return 1
      }) as never,
      clearInterval: clearInterval as never,
    })
    const text = read(writer.readable)
    writer.startHeartbeat()
    writer.startHeartbeat()
    tick!()
    void writer.send({ type: 'start' } as never)
    tick!()
    await writer.close()
    expect(clearInterval).toHaveBeenCalledWith(1)
    expect(await text).toBe(`${SSE_HEARTBEAT}event: start\ndata: {"type":"start"}\n\n${SSE_HEARTBEAT}`)
  })

  it('reports a gone client once and stops writing', async () => {
    const onClosed = vi.fn()
    const writer = createSseWriter({ onClosed })
    await writer.readable.cancel()
    expect(await writer.send({ type: 'start' } as never)).toBe(false)
    expect(await writer.send({ type: 'start' } as never)).toBe(false)
    expect(writer.closed).toBe(true)
    expect(onClosed).toHaveBeenCalledTimes(1)
    await writer.close()
  })
})
