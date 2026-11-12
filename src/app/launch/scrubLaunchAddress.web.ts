import { appVariant, type AppVariant } from '@/lib/appVariant'
import { takeGuestPageAddress } from '@/features/territories/guest/launch'
import { setLaunchAddress } from '@/lib/launchAddress'
import { scrubPurchaseReturn } from '@/lib/purchaseReturn'
import {
  pendingWebLink,
  readWebLinkAddress,
  type WebLinkKind,
} from '@/lib/webLinks/pendingWebLink'

const DEV_COUNTRY = 'dev_country'
const DEV_BUY_GATE = 'dev_buy_gate'
const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1'])

export type ScrubbedAddress = {
  forwardTo: string | null

  url: string
  appUserId: string | null

  forwarded: boolean
  devCountry: string | null
  devBuyGate: boolean

  webLink: { kind: WebLinkKind; link: string } | null
}

const takeParam = (
  url: string,
  name: string
): { url: string; value: string | null } => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { url, value: null }
  }
  const values = parsed.searchParams.getAll(name)
  if (values.length === 0) return { url, value: null }
  parsed.searchParams.delete(name)
  return {
    url: parsed.toString(),
    value: values.length === 1 ? values[0] : null,
  }
}

export function scrubAddress(
  {
    href,
    origin,
    hostname,
  }: { href: string; origin: string; hostname: string },
  variant: AppVariant
): ScrubbedAddress {
  const scrubbed = scrubPurchaseReturn(href, { variant, origin })
  const country = takeParam(scrubbed.url, DEV_COUNTRY)
  const buyGate = takeParam(country.url, DEV_BUY_GATE)
  const devLocal = variant === 'development' && LOCAL_HOSTS.has(hostname)

  const link = scrubbed.forwardTo ? null : readWebLinkAddress(buyGate.url)
  return {
    forwardTo: scrubbed.forwardTo,
    url: link ? `${origin}/` : buyGate.url,
    appUserId: scrubbed.forwardTo ? null : scrubbed.appUserId,
    forwarded: scrubbed.forwarded,
    devCountry: devLocal ? country.value : null,
    devBuyGate: devLocal && buyGate.value === '1',
    webLink: link?.link ? { kind: link.kind, link: link.link } : null,
  }
}

export function scrubLaunchAddress(
  { location, history }: Pick<Window, 'location' | 'history'> = window,
  variant: AppVariant = appVariant
): boolean {
  if (takeGuestPageAddress({ location, history })) return true
  const address = scrubAddress(location, variant)
  if (address.forwardTo) {
    location.replace(address.forwardTo)
    return false
  }
  if (address.url !== location.href)
    history.replaceState(history.state, '', address.url)
  if (address.webLink)
    pendingWebLink.set(address.webLink.kind, address.webLink.link)
  setLaunchAddress({
    returnedAppUserId: address.appUserId,
    forwardedReturn: address.forwarded,
    devCountry: address.devCountry,
    devBuyGate: address.devBuyGate,
  })
  return true
}
