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

export const webTabScreens = {
  Schedule: {
    path: 'schedule/:date?',
    parse: { month: Number, year: Number },
  },
  Contacts: {
    path: 'contacts/:contactId?',
    alias: ['Contacts'],
    stringify: { focusSearch: leftOut, highlightedVisitId: leftOut },
  },
  Map: { path: 'map', alias: ['Map'] },
  Progress: {
    path: 'progress',
    alias: ['Progress'],
    parse: { month: Number, year: Number },
  },
  Territories: {
    path: 'territories',
    alias: ['Territories'],
    stringify: { resume: leftOut },
  },
  Buddies: { path: 'buddies', alias: ['Buddies'] },
  Settings: { path: 'settings', alias: ['Settings'] },
  Tools: { path: 'tools', alias: ['Tools'] },
}
