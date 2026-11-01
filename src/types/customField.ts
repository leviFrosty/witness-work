export type CustomFieldDefinition = {
  id: string

  legacyIds?: string[]

  label: string

  order: number

  createdAt: number

  updatedAt: number

  archived?: boolean

  type?: 'text' | 'number' | 'date' | 'url'
}

export type CustomFieldTombstone = {
  id: string

  legacyIds?: string[]
  deletedAt: number
}
