/** Which build this is (`APP_VARIANT` in app.config.ts). */
export type AppVariant = 'development' | 'beta' | 'production'

/** Anything but a known variant reads as production, the strictest build. */
export const toAppVariant = (value: unknown): AppVariant =>
  value === 'development' || value === 'beta' ? value : 'production'
