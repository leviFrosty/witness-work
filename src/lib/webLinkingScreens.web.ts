import { PURCHASE_RETURN_PATH } from '@/lib/purchaseReturn'

const leftOut = (..._params: unknown[]) => undefined as unknown as string

export const webLinkingScreens = {
  'Web Purchase Return': PURCHASE_RETURN_PATH.slice(1),
  'Buddy Invite': {
    path: 'buddies/invite',
    stringify: { link: leftOut },
  },
  ScribeConsent: {
    path: 'ScribeConsent',
    stringify: { next: leftOut },
  },
} as const
