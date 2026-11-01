import type { RichText } from '@/types/richText'

export type Notification = {
  date: Date
  id: string
}

export type VisitTombstone = {
  id: string
  deletedAt: number

  importUndone?: true
}

export type Visit = {
  id: string

  updatedAt?: number
  contact: {
    id: string
  }
  date: Date

  receivedAt?: number
  note?: string

  noteDoc?: RichText

  followUp?: {
    date: Date
    notifyMe: boolean
    topic?: string

    notifications?: Notification[]

    reminderOffsetMinutes?: number

    dismissed?: boolean

    buddies?: string[]
  }
  isBibleStudy: boolean
  notAtHome?: boolean

  customFields?: Record<string, string>
}
