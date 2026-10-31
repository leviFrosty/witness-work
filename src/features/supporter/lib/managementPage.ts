/**
 * Where a web Manage button goes, read from `customerInfo.managementURL`'s
 * host: a store's own subscriptions page, or RevenueCat's customer portal (the
 * subscription page) for anything else. The Manage sheet's hint and
 * billing-issue copy name it, so the text matches the tab that opens.
 */
export type ManagementPage = 'app_store' | 'play_store' | 'subscription_page'

const STORE_HOSTS: Record<string, ManagementPage> = {
  'apps.apple.com': 'app_store',
  'play.google.com': 'play_store',
}

export const managementPage = (url: string | null): ManagementPage => {
  if (!url) return 'subscription_page'
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return 'subscription_page'
  }
  return STORE_HOSTS[host] ?? 'subscription_page'
}
