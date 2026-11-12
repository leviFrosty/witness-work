import { describe, expect, it } from 'vitest'
import { mapLinkHost } from '@/features/territories/lib/mapLinkHost'

describe('mapLinkHost', () => {
  it('shows the site a link opens', () => {
    expect(mapLinkHost('https://maps.app.goo.gl/AbCdEf')).toBe(
      'maps.app.goo.gl'
    )
    expect(mapLinkHost('https://www.google.com/maps/d/viewer?mid=1')).toBe(
      'google.com'
    )
    expect(mapLinkHost(' HTTP://Example.org:8080/t/12 ')).toBe('example.org')
  })

  it('leaves text without a site as it is', () => {
    expect(mapLinkHost('geo:40.1,-75.2')).toBe('geo:40.1,-75.2')
    expect(mapLinkHost('territory 12')).toBe('territory 12')
  })
})
