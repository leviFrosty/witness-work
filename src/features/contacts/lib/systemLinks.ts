import { isOwnAppLink } from '@/constants/appLinks'
import { isContactShareLink } from '@/features/contacts/lib/contactShareLink'

const FORWARDED_SCHEMES = ['tel:', 'sms:', 'mailto:', 'http:', 'https:']

export function shouldForwardToSystem(url: string): boolean {
  return (
    FORWARDED_SCHEMES.some((scheme) => url.startsWith(scheme)) &&
    !isOwnAppLink(url) &&
    !isContactShareLink(url)
  )
}
