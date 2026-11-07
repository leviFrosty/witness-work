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
