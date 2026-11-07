import { describe, expect, test } from 'vitest'
import { siteConfig } from '../../src/lib/site.ts'
import {
  absoluteUrl,
  landingPath,
  pageLocale,
  supportPath,
} from '../../src/lib/paths.ts'
import {
  bundlePath,
  bundleUrl,
  helpPageUrl,
} from '../../src/lib/help-center/paths.ts'

describe('site config', () => {
  test('production is the default and indexable', () => {
    expect(siteConfig(undefined)).toEqual({
      env: 'production',
      origin: 'https://witnesswork.app',
      helpSearchOrigin: 'https://help-search.witnesswork.app',
      indexable: true,
    })
  })

  test('dev is the staging site and never indexed', () => {
    expect(siteConfig('dev')).toEqual({
      env: 'dev',
      origin: 'https://dev.witnesswork.app',
      helpSearchOrigin: 'https://help-search-dev.witnesswork.app',
      indexable: false,
    })
  })

  test('an unknown environment fails the build', () => {
    expect(() => siteConfig('staging')).toThrow(/WW_SITE_ENV/)
  })
})

describe('site paths', () => {
  test('English is unprefixed; other locales lead the path', () => {
    expect(landingPath('en-US')).toBe('/')
    expect(landingPath('de-DE')).toBe('/de-DE')
    expect(supportPath('en-US')).toBe('/support')
    expect(supportPath('ar')).toBe('/ar/support')
  })

  test('absolute URLs are on the site origin', () => {
    expect(absoluteUrl('/privacy')).toBe('https://witnesswork.app/privacy')
    expect(absoluteUrl('/')).toBe('https://witnesswork.app/')
  })

  test('the Help Center lives under /help', () => {
    expect(helpPageUrl('en-US')).toBe('/help')
    expect(helpPageUrl('pt-BR')).toBe('/help/pt-BR')
    expect(helpPageUrl('en-US', 'time')).toBe('/help/time')
    expect(helpPageUrl('ar', 'time', 'time-rollover')).toBe(
      '/help/ar/time/time-rollover'
    )
  })

  test('bundles are listed by absolute URL', () => {
    expect(bundlePath('ja-JP')).toBe('/help/bundle/ja-JP.json')
    expect(bundleUrl('ja-JP')).toBe(
      'https://witnesswork.app/help/bundle/ja-JP.json'
    )
  })

  test("a page's locale comes from its path", () => {
    expect(pageLocale('/')).toBe('en-US')
    expect(pageLocale('/ar')).toBe('ar')
    expect(pageLocale('/zh-TW/support')).toBe('zh-TW')
    expect(pageLocale('/privacy')).toBe('en-US')
    expect(pageLocale('/help')).toBe('en-US')
    expect(pageLocale('/help/time/time-rollover')).toBe('en-US')
    expect(pageLocale('/help/ar/time/time-rollover')).toBe('ar')
    expect(pageLocale('/help/ja-JP')).toBe('ja-JP')
    expect(pageLocale('/xx-YY')).toBe('en-US')
  })
})
