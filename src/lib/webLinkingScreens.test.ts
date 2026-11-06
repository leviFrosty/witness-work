import { describe, expect, it } from 'vitest'
import { webLinkingScreens } from '@/lib/webLinkingScreens.web'

/**
 * React Navigation writes a screen's params into the web address's query, and
 * leaves out one whose `stringify` answers `undefined`. The addresses
 * themselves are checked in the browser (`e2e/web/scribe.spec.ts`).
 */
describe('the web address of Scribe AI screens', () => {
  it("leaves the Terms sheet's next stop out, which an address would spell [object Object]", () => {
    const { ScribeConsent } = webLinkingScreens
    expect(ScribeConsent.path).toBe('ScribeConsent')
    expect(
      ScribeConsent.stringify.next({
        route: 'ScribeConversation',
        params: { entry: 'home_orb' },
      } as never)
    ).toBeUndefined()
  })
})
