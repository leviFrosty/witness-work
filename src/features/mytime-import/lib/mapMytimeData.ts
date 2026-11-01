import type { Address, Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { TimeEntry } from '@/types/timeEntry'
import type { Category } from '@/types/category'
import type { CustomFieldDefinition } from '@/types/customField'
import type { Publisher } from '@/types/publisher'
import type {
  MytimeAdditionalInfoRow,
  MytimeRawTables,
  MytimeTimeTypeRow,
} from '@/features/mytime-import/lib/mytimeSchema'
import {
  LDC_BUILTIN_CATEGORY_ID,
  makeLdcBuiltinCategory,
} from '@/constants/categories'
import {
  coreDataRefToDate,
  coreDataRefToDateOrNull,
} from '@/features/mytime-import/lib/coreDataDate'

import type { MappedImport, MappedPublisher } from '@/lib/import/types'
import { splitMinutes } from '@/lib/entryMinutes'
export type { MappedImport, MappedPublisher }

export const callContactId = (zpk: number) => `mytime-call-${zpk}`
export const returnVisitId = (zpk: number) => `mytime-rv-${zpk}`

export const noteVisitId = (zpk: number) => `mytime-call-${zpk}-note`
export const infoTypeFieldId = (zpk: number) => `mytime-infotype-${zpk}`
export const timeEntryId = (zpk: number) => `mytime-time-${zpk}`
export const timeTypeCategoryId = (zpk: number) => `mytime-timetype-${zpk}`

export const hoursAdjustmentId = (yyyymm: number) => `mytime-hours-${yyyymm}`

const yyyymmToDate = (yyyymm: number): Date => {
  const year = Math.floor(yyyymm / 100)
  const month = yyyymm % 100
  return new Date(year, month - 1, 1, 12)
}

const resolveTimeCategory = (
  type: MytimeTimeTypeRow | undefined,
  categoriesById: Map<string, Category>,
  importedAtMs: number
): { categoryId?: string; credit?: boolean } => {
  const name = type?.ZNAME?.trim()
  if (!name || name === 'Hours') return {}

  if (name === 'LDC' || name === 'RBC') {
    if (!categoriesById.has(LDC_BUILTIN_CATEGORY_ID)) {
      categoriesById.set(
        LDC_BUILTIN_CATEGORY_ID,
        makeLdcBuiltinCategory(importedAtMs)
      )
    }
    return { categoryId: LDC_BUILTIN_CATEGORY_ID, credit: true }
  }

  const id = timeTypeCategoryId(type!.Z_PK)
  const isCredit = type!.ZDIRECTCREDIT === 1
  if (!categoriesById.has(id)) {
    categoriesById.set(id, {
      id,
      name,
      isCredit,
      updatedAt: importedAtMs,
    })
  }
  return { categoryId: id, credit: isCredit }
}

const parseVisitType = (
  type: string | null
): { isBibleStudy: boolean; notAtHome: boolean } => {
  const base = (type ?? '').replace(/^Transfered /, '').trim()
  return {
    isBibleStudy: base === 'Study',
    notAtHome: base === 'Not At Home',
  }
}

const clean = (s: string | null | undefined): string | undefined => {
  const t = s?.trim()
  return t ? t : undefined
}

const buildAddress = (c: {
  ZHOUSENUMBER: string | null
  ZSTREET: string | null
  ZAPARTMENTNUMBER: string | null
  ZCITY: string | null
  ZSTATE: string | null
}): Address | undefined => {
  const line1 = clean(
    [clean(c.ZHOUSENUMBER), clean(c.ZSTREET)].filter(Boolean).join(' ')
  )
  const address: Address = {}
  if (line1) address.line1 = line1
  const line2 = clean(c.ZAPARTMENTNUMBER)
  if (line2) address.line2 = line2
  const city = clean(c.ZCITY)
  if (city) address.city = city
  const state = clean(c.ZSTATE)
  if (state) address.state = state
  return Object.keys(address).length > 0 ? address : undefined
}

const applyInfoToContact = (
  contact: Contact,
  rows: MytimeAdditionalInfoRow[],
  infoTypeName: Map<number, string>,
  customFieldDefsById: Map<string, CustomFieldDefinition>,
  importedAtMs: number
): { notes: string[]; noteDate: number | null } => {
  const notes: string[] = []
  let noteDate: number | null = null
  for (const row of rows) {
    const name = row.ZTYPE != null ? infoTypeName.get(row.ZTYPE) : undefined
    const value = clean(row.ZVALUE)
    if (!value) continue
    if (name === 'Phone' || name === 'Mobile Phone') {
      if (!contact.phone) contact.phone = value
    } else if (name === 'Email') {
      if (!contact.email) contact.email = value
    } else if (name === 'Notes') {
      notes.push(value)
      if (row.ZDATE != null && (noteDate === null || row.ZDATE < noteDate)) {
        noteDate = row.ZDATE
      }
    } else if (name && row.ZTYPE != null) {
      const defId = infoTypeFieldId(row.ZTYPE)
      if (!customFieldDefsById.has(defId)) {
        customFieldDefsById.set(defId, {
          id: defId,
          label: name,
          order: customFieldDefsById.size,
          createdAt: importedAtMs,
          updatedAt: importedAtMs,
        })
      }
      contact.customFields = { ...contact.customFields, [defId]: value }
    }
  }
  return { notes, noteDate }
}

const mapPublisherType = (ztype: string | null): Publisher => {
  switch ((ztype ?? '').trim()) {
    case 'Publisher':
      return 'publisher'
    case 'Auxilliary Pioneer':
      return 'regularAuxiliary'
    case 'Pioneer':
      return 'regularPioneer'
    case 'Special Pioneer':
      return 'specialPioneer'
    case 'Traveling Servant':
      return 'circuitOverseer'
    default:
      return 'publisher'
  }
}

export const mapMytimeData = (
  tables: MytimeRawTables,
  importedAt: Date
): MappedImport => {
  const infoTypeName = new Map<number, string>()
  for (const t of tables.additionalInfoTypes) {
    if (t.ZNAME != null) infoTypeName.set(t.Z_PK, t.ZNAME)
  }
  const infoByCall = new Map<number, typeof tables.additionalInfo>()
  for (const a of tables.additionalInfo) {
    if (a.ZCALL == null) continue
    const list = infoByCall.get(a.ZCALL)
    if (list) list.push(a)
    else infoByCall.set(a.ZCALL, [a])
  }

  const importedAtMs = importedAt.getTime()
  const contacts: Contact[] = []
  const customFieldDefsById = new Map<string, CustomFieldDefinition>()

  const notesByCallPk = new Map<
    number,
    { notes: string[]; noteDate: number | null; mostRecent: number | null }
  >()

  const liveCallPks = new Set<number>()

  for (const c of tables.calls) {
    if (c.ZDELETEDCALL === 1) continue
    liveCallPks.add(c.Z_PK)

    const contact: Contact = {
      id: callContactId(c.Z_PK),
      name: c.ZNAME ?? '',
      createdAt: importedAt,
    }
    const address = buildAddress(c)
    if (address) contact.address = address
    const { notes, noteDate } = applyInfoToContact(
      contact,
      infoByCall.get(c.Z_PK) ?? [],
      infoTypeName,
      customFieldDefsById,
      importedAtMs
    )
    if (notes.length) {
      notesByCallPk.set(c.Z_PK, {
        notes,
        noteDate,
        mostRecent: c.ZMOSTRECENTRETURNVISITDATE,
      })
    }

    if (
      c.ZLATTITUDE != null &&
      c.ZLONGITUDE != null &&
      c.ZLATTITUDE !== 0 &&
      c.ZLONGITUDE !== 0
    ) {
      contact.coordinate = {
        latitude: c.ZLATTITUDE,
        longitude: c.ZLONGITUDE,
      }
    }
    contacts.push(contact)
  }

  const visits: Visit[] = []
  const visitsByCallPk = new Map<number, Visit[]>()

  for (const v of tables.returnVisits) {
    if (v.ZCALL == null || !liveCallPks.has(v.ZCALL)) continue
    const { isBibleStudy, notAtHome } = parseVisitType(v.ZTYPE)
    const visit: Visit = {
      id: returnVisitId(v.Z_PK),
      contact: { id: callContactId(v.ZCALL) },
      date: coreDataRefToDate(v.ZDATE ?? 0),
      isBibleStudy,
    }
    const note = clean(v.ZNOTES)
    if (note) visit.note = note
    if (notAtHome) visit.notAtHome = true
    visits.push(visit)
    const forCall = visitsByCallPk.get(v.ZCALL)
    if (forCall) forCall.push(visit)
    else visitsByCallPk.set(v.ZCALL, [visit])
  }

  for (const [callPk, { notes, noteDate, mostRecent }] of notesByCallPk) {
    const noteText = notes.join('\n\n')
    const callVisits = visitsByCallPk.get(callPk)
    if (callVisits && callVisits.length) {
      const earliest = callVisits.reduce((a, b) =>
        b.date.getTime() < a.date.getTime() ? b : a
      )
      earliest.note = earliest.note
        ? `${earliest.note}\n\n${noteText}`
        : noteText
    } else {
      const date =
        coreDataRefToDateOrNull(noteDate) ??
        coreDataRefToDateOrNull(mostRecent) ??
        importedAt
      visits.push({
        id: noteVisitId(callPk),
        contact: { id: callContactId(callPk) },
        date,
        isBibleStudy: false,
        note: noteText,
      })
    }
  }

  const timeTypeByPk = new Map<number, MytimeTimeTypeRow>()
  for (const t of tables.timeTypes) timeTypeByPk.set(t.Z_PK, t)

  const timeEntries: TimeEntry[] = []
  const categoriesById = new Map<string, Category>()

  for (const t of tables.timeEntries) {
    const entry: TimeEntry = {
      id: timeEntryId(t.Z_PK),
      ...splitMinutes(t.ZMINUTES ?? 0),
      date: coreDataRefToDate(t.ZDATE ?? 0),
    }
    const note = clean(t.ZNOTES)
    if (note) entry.note = note
    const { categoryId, credit } = resolveTimeCategory(
      t.ZTYPE != null ? timeTypeByPk.get(t.ZTYPE) : undefined,
      categoriesById,
      importedAtMs
    )
    if (categoryId) entry.categoryId = categoryId
    if (credit) entry.credit = true
    timeEntries.push(entry)
  }

  for (const a of tables.statisticsAdjustments) {
    if (a.ZTYPE !== 'Hours' || a.ZTIMESTAMP == null) continue
    const delta = a.ZADJUSTMENT ?? 0
    if (delta === 0) continue
    timeEntries.push({
      id: hoursAdjustmentId(a.ZTIMESTAMP),
      ...splitMinutes(delta),
      date: yyyymmToDate(a.ZTIMESTAMP),
    })
  }

  const firstUser = tables.users[0]
  const publisher: MappedPublisher | null = firstUser
    ? {
        role: mapPublisherType(firstUser.ZPUBLISHERTYPE),
        tenureStartDate: coreDataRefToDateOrNull(firstUser.ZPIONEERSTARTDATE),
      }
    : null

  return {
    contacts,
    visits,
    timeEntries,
    categories: [...categoriesById.values()],
    customFieldDefs: [...customFieldDefsById.values()],
    publisher,
  }
}
