import { describe, expect, it } from 'vitest'
import { managementPage } from '@/features/supporter/lib/managementPage'

describe('managementPage', () => {
  it.each([
    ['https://apps.apple.com/account/subscriptions', 'app_store'],
    ['https://play.google.com/store/account/subscriptions', 'play_store'],
    [
      'https://play.google.com/store/account/subscriptions?sku=x&package=y',
      'play_store',
    ],
    ['https://pay.rev.cat/manage/abc123', 'subscription_page'],
    ['https://billing.stripe.com/p/session/abc', 'subscription_page'],
  ] as const)('reads %s as %s', (url, page) => {
    expect(managementPage(url)).toBe(page)
  })

  it.each([
    'https://apps.apple.com.evil.example/x',
    'https://evil.example/?next=https://apps.apple.com',
    'not a url',
    null,
  ])('calls %s the subscription page, never a store', (url) => {
    expect(managementPage(url)).toBe('subscription_page')
  })
})
