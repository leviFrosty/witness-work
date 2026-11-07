import { expect, it, vi } from 'vitest'

const seen = vi.hoisted(() => ({ self: 'not called' as unknown }))

vi.mock('expo/fetch', () => ({
  fetch: function (this: unknown) {
    seen.self = this
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
