import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { useGeocodeRetry } from '@/stores/geocodeRetry'
import { deleteAvatarFiles } from '@/lib/contactAvatarFiles'
import type { DraftEffectOf } from '@/features/scribe/proposals/model'
import type {
  ApplyContext,
  ApplyOutcome,
  ContactSnapshot,
  UndoOutcome,
} from '@/features/scribe/proposals/effects/types'
import type { Address, Contact } from '@/types/contact'

const findContact = (id: string) =>
  useContacts.getState().contacts.find((contact) => contact.id === id)

function lookUpAddress(
  contact: Pick<Contact, 'id' | 'address' | 'coordinate'>,
  ctx: ApplyContext
) {
  if (!contact.address || ctx.prefs.dataProtectionMode) return
  useGeocodeRetry.getState().enqueue(contact)
}

export function applyContactCreate(
  draft: DraftEffectOf<'contact.create'>,
  ctx: ApplyContext
): ApplyOutcome {
  const contact: Contact = {
    id: ctx.newId(),
    name: draft.name,
    createdAt: ctx.now,
    ...(draft.address ? { address: draft.address } : {}),
    ...(draft.phone ? { phone: draft.phone } : {}),
    ...(draft.email ? { email: draft.email } : {}),
  }
  const consentGivenAt = ctx.consents.get(draft.ref)
  if (consentGivenAt) contact.consentGivenAt = consentGivenAt
  useContacts.getState().addContact(contact)
  ctx.bound.set(draft.ref, contact.id)
  lookUpAddress(contact, ctx)
  return {
    status: 'applied',
    undo: { kind: 'contact.create', contactId: contact.id, ref: draft.ref },
  }
}

export function undoContactCreate(
  contactId: string,
  ownVisitIds: ReadonlySet<string>
): UndoOutcome {
  if (!findContact(contactId)) return 'gone'
  const referenced = useConversations
    .getState()
    .conversations.some(
      (visit) => visit.contact.id === contactId && !ownVisitIds.has(visit.id)
    )
  if (referenced) return 'kept'
  const contacts = useContacts.getState()
  contacts.deleteContact(contactId)
  contacts.removeDeletedContact(contactId)
  void deleteAvatarFiles(contactId)
  return 'undone'
}

const snapshotOf = (contact: Contact): ContactSnapshot => ({
  name: contact.name,
  phone: contact.phone ?? null,
  email: contact.email ?? null,
  address: contact.address ?? null,
  coordinate: contact.coordinate ?? null,
})

const ADDRESS_PARTS = [
  'line1',
  'line2',
  'city',
  'state',
  'zip',
  'country',
] as const satisfies readonly (keyof Address)[]

const sameAddress = (
  a: Address | null | undefined,
  b: Address | null | undefined
) => ADDRESS_PARTS.every((part) => (a?.[part] ?? '') === (b?.[part] ?? ''))

const editedSince = (contact: Contact, after: ContactSnapshot): boolean => {
  const now = snapshotOf(contact)
  return (
    now.name !== after.name ||
    now.phone !== after.phone ||
    now.email !== after.email ||
    !sameAddress(now.address, after.address) ||
    (!!contact.userDraggedCoordinate &&
      JSON.stringify(now.coordinate) !== JSON.stringify(after.coordinate))
  )
}

export function applyContactUpdate(
  draft: DraftEffectOf<'contact.update'>,
  ctx: ApplyContext
): ApplyOutcome {
  const contact = findContact(draft.contactId)
  if (!contact) return { status: 'skipped', reason: 'missing' }
  if ((contact.updatedAt ?? null) !== draft.expectUpdatedAt)
    return { status: 'skipped', reason: 'changed' }
  const before = snapshotOf(contact)
  const { set } = draft
  const address =
    set.address === undefined ? contact.address : (set.address ?? undefined)
  const moved = !sameAddress(address, contact.address)
  const changes: Partial<Contact> = {
    id: contact.id,
    ...(set.name !== undefined ? { name: set.name } : {}),
    ...(set.phone !== undefined ? { phone: set.phone ?? undefined } : {}),
    ...(set.email !== undefined ? { email: set.email ?? undefined } : {}),
    ...(set.address !== undefined ? { address } : {}),

    ...(moved && !contact.userDraggedCoordinate
      ? { coordinate: undefined }
      : {}),
  }
  useContacts.getState().updateContact(changes)
  if (moved && !contact.userDraggedCoordinate)
    lookUpAddress({ id: contact.id, address, coordinate: undefined }, ctx)
  const updated = findContact(contact.id)
  return {
    status: 'applied',
    undo: {
      kind: 'contact.update',
      contactId: contact.id,
      before,
      afterUpdatedAt: updated?.updatedAt ?? null,
      ...(updated ? { after: snapshotOf(updated) } : {}),
    },
  }
}

export function undoContactUpdate(
  contactId: string,
  before: ContactSnapshot,
  afterUpdatedAt: number | null,
  after?: ContactSnapshot
): UndoOutcome {
  const contact = findContact(contactId)
  if (!contact) return 'gone'
  if (
    after
      ? editedSince(contact, after)
      : (contact.updatedAt ?? null) !== afterUpdatedAt
  )
    return 'kept'
  const restorePin =
    !sameAddress(before.address, contact.address) &&
    !contact.userDraggedCoordinate
  useContacts.getState().updateContact({
    id: contactId,
    name: before.name,
    phone: before.phone ?? undefined,
    email: before.email ?? undefined,
    address: before.address ?? undefined,
    ...(restorePin || !after
      ? { coordinate: before.coordinate ?? undefined }
      : {}),
  })
  return 'undone'
}
