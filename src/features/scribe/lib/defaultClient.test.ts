import { expect, it, vi } from 'vitest'

const seen = vi.hoisted(() => ({
  self: 'not called' as unknown,
  calls: 0,
  termsPending: false,
}))

vi.mock('expo/fetch', () => ({
  fetch: function (this: unknown) {
    seen.self = this
    seen.calls += 1
    return Promise.resolve(
      new Response(
        `data: ${JSON.stringify({ type: 'done', finish: 'end', usage: {}, meter: null })}\n\n`,
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      )
    )
  },
}))
vi.mock('@/lib/serverAccount', () => ({
  accountSessions: {
    withSession: (run: (authorization: string) => Promise<unknown>) =>
      run('Bearer test'),
  },
}))
vi.mock('@/lib/serverAccount/revenueCatLinkRuntime', () => ({
  linkBeforePaidCall: async () => {},
}))
vi.mock('@/features/scribe/stores/consent', () => ({
  scribeTermsPending: () => seen.termsPending,
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))

import { scribeClient } from '@/features/scribe/lib/defaultClient'

it("streams a step through expo/fetch as a plain call, which the web's fetch needs", async () => {
  const events: string[] = []
  const done = await scribeClient().step({} as never, {
    onEvent: (event) => events.push(event.type),
  })
  expect(done.type).toBe('done')
  expect(events).toEqual(['done'])
  expect(seen.self).toBeUndefined()
})

it('sends nothing before this device agrees to the Terms of Use', async () => {
  seen.termsPending = true
  seen.calls = 0
  try {
    await expect(
      scribeClient().step({} as never, { onEvent: () => {} })
    ).rejects.toMatchObject({ code: 'cancelled' })
    await expect(
      scribeClient().territoryNotes({} as never)
    ).rejects.toMatchObject({ code: 'cancelled' })
    await expect(scribeClient().transcribe({} as never)).rejects.toMatchObject({
      code: 'cancelled',
    })
    expect(seen.calls).toBe(0)
  } finally {
    seen.termsPending = false
  }
})
