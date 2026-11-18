import { getPathFromState, getStateFromPath } from '@react-navigation/core'
import { describe, expect, it } from 'vitest'
import { webLinkingScreens, webTabScreens } from '@/lib/webLinkingScreens.web'

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

describe('the web address of each tab', () => {
  const config = {
    screens: { Root: { screens: { Home: 'home', ...webTabScreens } } },
  } as Parameters<typeof getStateFromPath>[1]
  const tabAt = (path: string) => {
    const root = getStateFromPath(path, config)?.routes[0]
    return root?.name === 'Root' ? root.state?.routes[0] : undefined
  }
  const pathOf = (name: string, params: object) =>
    getPathFromState(
      { routes: [{ name: 'Root', state: { routes: [{ name, params }] } }] },
      config
    )

  it.each([
    ['/map', 'Map'],
    ['/Map', 'Map'],
    ['/contacts', 'Contacts'],
    ['/Contacts', 'Contacts'],
    ['/progress', 'Progress'],
    ['/territories', 'Territories'],
    ['/buddies', 'Buddies'],
    ['/settings', 'Settings'],
    ['/schedule/2026-03-04', 'Schedule'],
  ])('reloads %s on its tab, not Home', (path, name) => {
    expect(tabAt(path)?.name).toBe(name)
  })

  it('writes the lowercase path', () => {
    expect(pathOf('Map', {})).toBe('/map')
  })

  it('reads the month and year back as numbers', () => {
    expect(tabAt('/progress?month=3&year=2026')?.params).toEqual({
      month: 3,
      year: 2026,
    })
    expect(tabAt('/schedule?month=3&year=2026')?.params).toEqual({
      month: 3,
      year: 2026,
    })
  })

  it('leaves one-shot params out, so a reload does not act on them again', () => {
    expect(pathOf('Contacts', { focusSearch: true })).toBe('/contacts')
    expect(pathOf('Territories', { resume: true })).toBe('/territories')
  })
})
