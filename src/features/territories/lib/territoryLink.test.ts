import { describe, expect, it, vi } from 'vitest'
import {
  coordinateFromLink,
  isShortMapLink,
  linkFromText,
  mapLinkFor,
  resolveLinkCoordinate,
} from '@/features/territories/lib/territoryLink'

const POINT = { latitude: -1.2921, longitude: 36.8219 }

describe('coordinateFromLink', () => {
  it.each([
    ['https://www.google.com/maps/@-1.2921,36.8219,15z'],
    ['https://www.google.com/maps/search/?api=1&query=-1.2921,36.8219'],
    ['https://www.google.com/maps/search/?api=1&query=-1.2921%2C36.8219'],
    ['https://maps.google.com/?q=-1.2921,36.8219'],
    ['https://www.google.com/maps/dir/?api=1&destination=-1.2921,36.8219'],
    ['https://maps.apple.com/?ll=-1.2921,36.8219&q=Territory'],
    ['https://maps.apple.com/place?coordinate=-1.2921,36.8219'],
    ['https://www.openstreetmap.org/#map=16/-1.2921/36.8219'],
    ['https://www.openstreetmap.org/?mlat=-1.2921&mlon=36.8219#map=16/0/0'],
    ['geo:-1.2921,36.8219'],
    ['-1.2921, 36.8219'],
  ])('reads %s', (link) => {
    expect(coordinateFromLink(link)).toEqual(POINT)
  })

  it('prefers the pinned place over the map camera', () => {
    expect(
      coordinateFromLink(
        'https://www.google.com/maps/place/Somewhere/@-1.3,36.8,15z/data=!3m1!4b1!4m6!3m5!8m2!3d-1.2921!4d36.8219'
      )
    ).toEqual(POINT)
  })

  it('reads a link nested in a consent redirect', () => {
    expect(
      coordinateFromLink(
        'https://consent.google.com/m?continue=https%3A%2F%2Fwww.google.com%2Fmaps%2F%40-1.2921%2C36.8219%2C15z'
      )
    ).toEqual(POINT)
  })

  it('keeps zero coordinates', () => {
    expect(coordinateFromLink('geo:0,0')).toEqual({ latitude: 0, longitude: 0 })
  })

  it.each([
    ['https://drive.google.com/file/d/abc123/view'],
    ['https://www.google.com/maps/d/viewer?mid=1AbCdEf'],
    ['https://www.google.com/maps/@-91.5,36.8,15z'],
    ['12 Oak Street'],
    [''],
  ])('finds no point in %s', (link) => {
    expect(coordinateFromLink(link)).toBeUndefined()
  })
})

describe('linkFromText', () => {
  it('takes the link out of scanned text', () => {
    expect(linkFromText('Territory 14 https://maps.app.goo.gl/abc123')).toBe(
      'https://maps.app.goo.gl/abc123'
    )
  })

  it('returns nothing for plain text', () => {
    expect(linkFromText('Territory 14')).toBeUndefined()
  })
})

describe('resolveLinkCoordinate', () => {
  it('follows a short link to where it lands', async () => {
    const fetchLink = vi.fn().mockResolvedValue({
      url: 'https://www.google.com/maps/@-1.2921,36.8219,15z',
    })
    await expect(
      resolveLinkCoordinate('https://maps.app.goo.gl/abc123', fetchLink)
    ).resolves.toEqual(POINT)
  })

  it('does not fetch a link that is not a short map link', async () => {
    const fetchLink = vi.fn()
    await expect(
      resolveLinkCoordinate('https://drive.google.com/file/d/abc', fetchLink)
    ).resolves.toBeUndefined()
    expect(fetchLink).not.toHaveBeenCalled()
  })

  it('gives up quietly when the link cannot be reached', async () => {
    const fetchLink = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(
      resolveLinkCoordinate('https://maps.app.goo.gl/abc123', fetchLink)
    ).resolves.toBeUndefined()
  })
})

describe('isShortMapLink', () => {
  it('knows the short map hosts', () => {
    expect(isShortMapLink('https://maps.app.goo.gl/abc')).toBe(true)
    expect(isShortMapLink('https://www.google.com/maps/@1,2,3z')).toBe(false)
  })
})

describe('mapLinkFor', () => {
  it('builds a link any phone can open', () => {
    expect(mapLinkFor(POINT)).toBe(
      'https://www.google.com/maps/search/?api=1&query=-1.2921,36.8219'
    )
    expect(coordinateFromLink(mapLinkFor(POINT))).toEqual(POINT)
  })
})
