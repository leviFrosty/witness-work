import { describe, expect, it } from 'vitest'
import webEnvironments from '../../config/web-environments.json'
import {
  scrubAnalyticsEventProperties,
  scrubDiagnosticText,
  scrubShareLinkProperties,
  scrubShareLinkUrl,
} from '@/lib/shareLinkScrub'

describe('scrubShareLinkUrl', () => {
  it('drops contact payloads from legacy path links', () => {
    expect(
      scrubShareLinkUrl('https://ww-proxy.leviwilkerson.com/c/H4sIAAAA_x-y')
    ).toBe('https://ww-proxy.leviwilkerson.com/c/[redacted]')
  })

  it('drops fragments from ww-proxy links', () => {
    expect(
      scrubShareLinkUrl('https://ww-proxy.leviwilkerson.com/c#H4sIAAAA')
    ).toBe('https://ww-proxy.leviwilkerson.com/c#[redacted]')
    expect(
      scrubShareLinkUrl(
        'https://ww-proxy.leviwilkerson.com/b#1AbCdEfGhIjKlMnOpQrStUv'
      )
    ).toBe('https://ww-proxy.leviwilkerson.com/b#[redacted]')
  })

  it('drops a territory guest link on any host, and on its own', () => {
    const link = `v1.${'a'.repeat(22)}.${'b-_'.repeat(7)}b.${'c'.repeat(43)}`
    expect(
      scrubShareLinkUrl(`http://127.0.0.1:8130/territories/guest#${link}`)
    ).toBe('http://127.0.0.1:8130/territories/guest#[redacted]')
    expect(
      scrubShareLinkUrl(`https://app.witnesswork.app/territories/guest#${link}`)
    ).toBe('https://app.witnesswork.app/territories/guest#[redacted]')
    expect(scrubShareLinkUrl(`opened ${link} twice`)).toBe(
      'opened [redacted] twice'
    )
  })

  it('drops fragments on the new hosts and the web app', () => {
    for (const [url, scrubbed] of [
      [
        'https://witnesswork.app/contacts#H4sIAAAA',
        'https://witnesswork.app/contacts#[redacted]',
      ],
      [
        'https://witnesswork.app/buddies/invite#1AbCdEfGhIjKlMnOpQrStUv',
        'https://witnesswork.app/buddies/invite#[redacted]',
      ],
      [
        'https://witnesswork.app/accounts/handoff?lang=es#1Secret',
        'https://witnesswork.app/accounts/handoff?lang=es#[redacted]',
      ],
      [
        'https://beta.witnesswork.app/contacts#H4sIAAAA',
        'https://beta.witnesswork.app/contacts#[redacted]',
      ],
      [
        'https://app.witnesswork.app/contacts#H4sIAAAA',
        'https://app.witnesswork.app/contacts#[redacted]',
      ],
      [
        'opened "https://WITNESSWORK.APP/contacts#H4sIAAAA" twice',
        'opened "https://WITNESSWORK.APP/contacts#[redacted]" twice',
      ],
    ])
      expect(scrubShareLinkUrl(url)).toBe(scrubbed)
  })

  it('drops secrets from percent-encoded links on every host', () => {
    for (const link of [
      'https://witnesswork.app/contacts#H4sISECRET',
      'https://beta.witnesswork.app/buddies/invite#1SECRET',
      'https://app.witnesswork.app/contacts#H4sISECRET',
      'https://witnesswork.app/accounts/handoff?lang=es#1SECRET',
      'https://ww-proxy.leviwilkerson.com/c#H4sISECRET',
      'https://ww-proxy.leviwilkerson.com/contacts#H4sISECRET',
      'https://ww-proxy.leviwilkerson.com/b#1SECRET',
      'https://ww-proxy.leviwilkerson.com/h#1SECRET',
      'https://ww-proxy.leviwilkerson.com/c/H4sISECRET',
      'witnesswork://import-contact/H4sISECRET',
    ]) {
      const once = encodeURIComponent(link)
      for (const text of [
        once,
        once.toLowerCase().replace(/secret/g, 'SECRET'),
        encodeURIComponent(once),
        `https://example.com/open?u=${once}&x=1`,
      ])
        expect(scrubShareLinkUrl(text)).not.toContain('SECRET')
    }
    expect(
      scrubShareLinkUrl('https%3A%2F%2Fwitnesswork.app%2Fcontacts%23H4sISECRET')
    ).toBe('https%3A%2F%2Fwitnesswork.app%2Fcontacts%23[redacted]')
  })

  it('redacts from the first # on, wherever more follow', () => {
    for (const text of [
      'https://witnesswork.app/contacts%23SECRET%23more',
      'https://witnesswork.app/contacts%23SECRET#more',
      'https://witnesswork.app/contacts#SECRET%23more',
    ])
      expect(scrubShareLinkUrl(text)).not.toContain('SECRET')
  })

  it('redacts fragments after a quote in the query, which the parsers read', () => {
    for (const text of [
      `https://witnesswork.app/buddies/invite?r='x#1SECRET`,
      'https://witnesswork.app/buddies/invite?r="x#1SECRET',
    ])
      expect(scrubShareLinkUrl(text)).not.toContain('SECRET')
  })

  it('drops payloads from the import-contact hand-off', () => {
    expect(scrubShareLinkUrl('witnesswork://import-contact/H4sIAAAA')).toBe(
      'witnesswork://import-contact/[redacted]'
    )
  })

  it('leaves other URLs alone', () => {
    expect(scrubShareLinkUrl('witnesswork://contact/abc#note')).toBe(
      'witnesswork://contact/abc#note'
    )
    expect(scrubShareLinkUrl('https://example.com/c/x#y')).toBe(
      'https://example.com/c/x#y'
    )
    expect(scrubShareLinkUrl('https://witnesswork.app/c/x')).toBe(
      'https://witnesswork.app/c/x'
    )
  })
})

describe('scrubShareLinkProperties', () => {
  it('scrubs string values and keeps everything else', () => {
    expect(
      scrubShareLinkProperties({
        url: 'https://ww-proxy.leviwilkerson.com/c#payload',
        version: '1.43.0',
        count: 2,
      })
    ).toEqual({
      url: 'https://ww-proxy.leviwilkerson.com/c#[redacted]',
      version: '1.43.0',
      count: 2,
    })
  })
})

describe('scrubDiagnosticText', () => {
  it('drops query values from request URLs, keeping the path', () => {
    expect(
      scrubDiagnosticText(
        'fetch failed: https://api.witnesswork.app/geocode?q=12%20Main%20St&limit=1 (500)'
      )
    ).toBe('fetch failed: https://api.witnesswork.app/geocode?[redacted] (500)')
    expect(
      scrubDiagnosticText('/places/v1/search?q=Main&at=40.71,-74.00')
    ).toBe('/places/v1/search?[redacted]')
  })

  it('still drops share links, and leaves a plain question alone', () => {
    expect(
      scrubDiagnosticText('opened https://witnesswork.app/contacts#H4sIAAAA')
    ).toBe('opened https://witnesswork.app/contacts#[redacted]')
    expect(scrubDiagnosticText('Why did this fail?')).toBe('Why did this fail?')
  })
})

describe('scrubAnalyticsEventProperties for exceptions', () => {
  const url = 'https://api.witnesswork.app/places/v1/search?q=Main%20St&at=1,2'
  const share = 'https://witnesswork.app/contacts#H4sIAAAA'

  it('scrubs messages, values, frames and steps at any depth', () => {
    const sent = scrubAnalyticsEventProperties('$exception', {
      $exception_list: [
        {
          type: 'TypeError',
          value: `Network request failed: ${url}`,
          mechanism: { handled: false },
          stacktrace: {
            frames: [{ filename: 'index.bundle', lineno: 4, vars: { url } }],
          },
        },
      ],
      $exception_steps: [
        { $message: 'Opened link', data: { link: share, count: 3 } },
      ],
      $exception_level: 'error',
    })
    const text = JSON.stringify(sent)
    expect(text).not.toContain('Main')
    expect(text).not.toContain('at=1,2')
    expect(text).not.toContain('H4sIAAAA')
    expect(sent.$exception_list).toEqual([
      {
        type: 'TypeError',
        value:
          'Network request failed: https://api.witnesswork.app/places/v1/search?[redacted]',
        mechanism: { handled: false },
        stacktrace: {
          frames: [
            {
              filename: 'index.bundle',
              lineno: 4,
              vars: {
                url: 'https://api.witnesswork.app/places/v1/search?[redacted]',
              },
            },
          ],
        },
      },
    ])
    expect(sent.$exception_steps).toEqual([
      {
        $message: 'Opened link',
        data: {
          link: 'https://witnesswork.app/contacts#[redacted]',
          count: 3,
        },
      },
    ])
    expect(sent.$exception_level).toBe('error')
  })

  it('leaves the same keys alone on other events', () => {
    const steps = [{ $message: url }]
    expect(
      scrubAnalyticsEventProperties('survey sent', { $exception_steps: steps })
        .$exception_steps
    ).toBe(steps)
  })
})

describe('the web app’s link routes (docs/app-links.md "Without the app")', () => {
  const hosts = Object.values(webEnvironments)
    .map((environment) => environment.host)
    .filter((host) => host !== 'localhost')
  const fragments = ['H4sIAAAAPAYLOAD', '1AbCdEfGhIjKlMnOpQrStUv']

  it.each(hosts)(
    'keeps their fragments out of every URL PostHog sends from %s',
    (host) => {
      for (const route of ['/contacts', '/c', '/buddies/invite', '/b'])
        for (const fragment of fragments) {
          const url = `https://${host}${route}#${fragment}`
          const sent = scrubAnalyticsEventProperties('$pageview', {
            $current_url: url,
            $initial_current_url: url,
            $session_entry_url: url,
            $referrer: `https://beta.witnesswork.app${route}#${fragment}`,
            link: `opened ${encodeURIComponent(url)}`,
          })
          expect(JSON.stringify(sent)).not.toContain(fragment)
          expect(sent.$current_url).toBe(`https://${host}${route}#[redacted]`)
        }
    }
  )
})
