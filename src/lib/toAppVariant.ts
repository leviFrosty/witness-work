export type AppVariant = 'development' | 'beta' | 'production'

export const toAppVariant = (value: unknown): AppVariant =>
  value === 'development' || value === 'beta' ? value : 'production'
