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

/**
 * What a Proposal holds on the device (ADR 0032 §3): effects the write tools
 * validated and resolved against the stores, not yet applied. Persisted with
 * the conversation, so ids are resolved record ids, never Refs, except for the
 * pending Refs (`n1`, `nk1`) of records the Proposal itself would create.
 */

/** Standard, an existing Category, or one this Proposal creates. */
export type CategoryTarget =
  | { type: 'standard' }
  | { type: 'existing'; id: string }
  | { type: 'pending'; ref: string }

/** An existing Contact, or one this Proposal creates (by its pending Ref). */
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
      /** The entry when it was read, for the card. */
      entryDate: string
      entryMinutes: number
      entryCategory: CategoryTarget
      /** The entry's `updatedAt` when it was read; re-checked at apply. */
      expectUpdatedAt: number | null
      set: TimeFields
      before: TimeFields
      spoken: ScribeSpoken
    }
  | {
      kind: 'time.delete'
      entryId: string
      /** The entry when it was read, for the card. */
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
      /**
       * Inbox ids of the buddies the User said they'd go with. Nobody is
       * invited (Scribe AI sends nothing to anyone); the card says how to.
       * Absent on Proposals from before it.
       */
      inviteHint?: string[]
    }
  | {
      kind: 'plan.update'
      planId: string
      /** The Plan's day and title when it was read, for the card. */
      planDate: string
      planTitle: string | null
      /** The Plan's `updatedAt` when it was read; re-checked at apply. */
      expectUpdatedAt: number | null
      set: PlanFields
      before: PlanFields
      spoken: ScribeSpoken
    }
  | {
      kind: 'contact.create'
      /** The pending Ref (`n1`) later calls use for this Contact. */
      ref: string
      name: string
      address: Address | null
      phone: string | null
      email: string | null
      /**
       * `visits_log` `askBetween`: the existing Contacts the User may have
       * meant; this record is the New option.
       */
      askBetween: string[] | null
    }
  | {
      kind: 'contact.update'
      contactId: string
      /** The Contact's name when it was read, for the card. */
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
  /** `${callId}:${index}`. */
  id: string
  /**
   * The tool calls that proposed it (for `proposal_outcome`): one, or more when
   * a later call named the same new Contact or Category again.
   */
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
      /** Existing Contacts the User may have meant, in the model's order. */
      optionIds: string[]
      /** The pending Ref of the New option. */
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
  /** When it stopped being pending (Add, Dismiss, a new message, Undo). */
  resolvedAt: number | null
  /** Records its Undo left in place (changed since, or in use). */
  undoKept?: number
}

/** Kind order the apply saga runs effects in. */
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
