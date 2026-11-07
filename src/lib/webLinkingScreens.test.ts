import { describe, expect, it } from 'vitest'
import { webLinkingScreens } from '@/lib/webLinkingScreens.web'

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
