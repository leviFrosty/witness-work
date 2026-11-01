import type {
  ScribeContactChoice,
  ScribeEffect,
  ScribeEffectKind,
  ScribeProposalStatus,
  ScribeReviewCard,
  ScribeSpoken,
  ScribeWarning,
} from '@/features/scribe/types'
import type { Address } from '@/types/contact'

export type CategoryTarget =
  | { type: 'standard' }
  | { type: 'existing'; id: string }
  | { type: 'pending'; ref: string }

export type ContactTarget =
  | { type: 'existing'; id: string }
  | { type: 'pending'; ref: string }

export interface PlanFields {
  date?: string
  minutes?: number
  startMinutes?: number | null
  anytime?: boolean
  title?: string | null
  note?: string | null
}

export interface TimeFields {
  date?: string
  minutes?: number
  category?: CategoryTarget
  note?: string | null
}

export interface ContactFields {
  name?: string
  phone?: string | null
  email?: string | null
  address?: Address | null
}

export type DraftEffect =
  | {
      kind: 'time.create'
      date: string
      minutes: number
      category: CategoryTarget
      note: string | null
      spoken: ScribeSpoken
    }
  | {
      kind: 'time.update'
      entryId: string

      entryDate: string
      entryMinutes: number
      entryCategory: CategoryTarget

      expectUpdatedAt: number | null
      set: TimeFields
      before: TimeFields
      spoken: ScribeSpoken
    }
  | {
      kind: 'time.delete'
      entryId: string

      entryDate: string
      entryMinutes: number
      entryCategory: CategoryTarget
      entryNote: string | null
      expectUpdatedAt: number | null
    }
  | {
      kind: 'plan.create'
      date: string
      minutes: number
      startMinutes: number | null
      anytime: boolean
      category: CategoryTarget
      title: string | null
      note: string | null
      spoken: ScribeSpoken

      inviteHint?: string[]
    }
  | {
      kind: 'plan.update'
      planId: string

      planDate: string
      planTitle: string | null

      expectUpdatedAt: number | null
      set: PlanFields
      before: PlanFields
      spoken: ScribeSpoken
    }
  | {
      kind: 'contact.create'

      ref: string
      name: string
      address: Address | null
      phone: string | null
      email: string | null

      askBetween: string[] | null

      needsConsent?: boolean
    }
  | {
      kind: 'contact.update'
      contactId: string

      contactName: string
      expectUpdatedAt: number | null
      set: ContactFields
      before: ContactFields
    }
  | {
      kind: 'visit.create'
      contact: ContactTarget
      date: string
      notAtHome: boolean
      bibleStudy: boolean
      note: string | null
      followUp: {
        date: string
        topic: string | null
        spoken: ScribeSpoken
      } | null
      spoken: ScribeSpoken
    }
  | {
      kind: 'category.create'
      ref: string
      name: string
      credit: boolean
    }

export type DraftEffectOf<K extends ScribeEffectKind> = Extract<
  DraftEffect,
  { kind: K }
>

export interface StoredEffect {
  id: string

  callIds: string[]
  draft: DraftEffect
  warnings: ScribeWarning[]
  status: ScribeEffect['status']
  skipReason: ScribeEffect['skipReason']
}

export type StoredCardContact =
  | { type: 'existing'; contactId: string }
  | { type: 'new'; ref: string }
  | {
      type: 'choice'
      spokenName: string

      optionIds: string[]

      newRef: string
      chosen: ScribeContactChoice | null
    }

export interface StoredCard {
  id: string
  kind: ScribeReviewCard['kind']
  contact: StoredCardContact | null
  effectIds: string[]
  selected: boolean
  status: ScribeReviewCard['status']

  consent?: { givenAt: string | null }
}

export interface StoredProposal {
  id: string
  conversationId: string
  turnId: string
  createdAt: number
  status: ScribeProposalStatus
  effects: StoredEffect[]
  cards: StoredCard[]
  invalidCount: number
  tainted: boolean

  resolvedAt: number | null

  undoKept?: number
}

export const APPLY_ORDER: readonly ScribeEffectKind[] = [
  'category.create',
  'contact.create',
  'contact.update',
  'visit.create',
  'time.create',
  'time.update',
  'time.delete',
  'plan.create',
  'plan.update',
]
