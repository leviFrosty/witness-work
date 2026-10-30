import { describe, expect, it } from 'vitest'
import { redactLink } from '@/lib/redactLink'

describe('redactLink', () => {
  it('never shows a capability link’s fragment', () => {
    expect(
      redactLink('https://ww-proxy.leviwilkerson.com/b#1AbCdEfGhIjKlMnOp')
    ).toBe('https://ww-proxy.leviwilkerson.com/b#…')
    expect(
      redactLink('https://ww-proxy.leviwilkerson.com/accounts/handoff#1Secret')
    ).toBe('https://ww-proxy.leviwilkerson.com/accounts/…#…')
    expect(
      redactLink('https://witnesswork.app/buddies/invite#1AbCdEfGhIjKlMnOp')
    ).toBe('https://witnesswork.app/buddies/…#…')
    expect(redactLink('https://dev.witnesswork.app/contacts#H4sIAAAA')).toBe(
      'https://dev.witnesswork.app/contacts#…'
    )
    expect(
      redactLink('https://witnesswork.app/accounts/handoff?lang=es#1Secret')
    ).toBe('https://witnesswork.app/accounts/…?…#…')
  })

  it('never shows a payload in the path or the query', () => {
    expect(
      redactLink('witnesswork://import-contact/eyJuYW1lIjoiQW5uYSJ9')
    ).toBe('witnesswork://import-contact/…')
    expect(redactLink('https://ww-proxy.leviwilkerson.com/c/eyJu?x=1#y')).toBe(
      'https://ww-proxy.leviwilkerson.com/c/…?…#…'
    )
  })

  it('keeps a plain link as it is', () => {
    expect(redactLink('witnesswork://add-time')).toBe('witnesswork://add-time')
    expect(redactLink('https://example.com/')).toBe('https://example.com/')
  })

  it('shows nothing of what isn’t a link', () => {
    expect(redactLink('1AbCdEfGhIjKlMnOp')).toBe('[link]')
    expect(redactLink(null)).toBe('null')
    expect(redactLink(undefined)).toBe('undefined')
  })
})
