import { isContactShareLink } from '@/features/contacts/lib/contactShareLink'

const FORWARDED_SCHEMES = ['tel:', 'sms:', 'mailto:', 'http:', 'https:']

const APP_LINK_ORIGIN = /^https:\/\/ww-proxy\.leviwilkerson\.com(?:[/?#]|$)/i

export function shouldForwardToSystem(url: string): boolean {
  return (
    FORWARDED_SCHEMES.some((scheme) => url.startsWith(scheme)) &&
    !APP_LINK_ORIGIN.test(url) &&
    !isContactShareLink(url)
  )
}
