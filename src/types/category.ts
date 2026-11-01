export type Category = {
  id: string

  legacyIds?: string[]

  name: string

  isCredit: boolean

  builtin?: boolean

  updatedAt?: number
}

export type CategoryTombstone = {
  id: string

  legacyIds?: string[]
  deletedAt: number
}
