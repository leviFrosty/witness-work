const DAY_MS = 24 * 60 * 60 * 1000

export const GUEST_LINK_DAYS = [1, 3, 7, 14, 30] as const

export type GuestLinkDays = (typeof GUEST_LINK_DAYS)[number]

export const DEFAULT_GUEST_LINK_DAYS: GuestLinkDays = 1

export const guestLinkDays = (saved: unknown): GuestLinkDays =>
  GUEST_LINK_DAYS.find((days) => days === saved) ?? DEFAULT_GUEST_LINK_DAYS

export const guestLinkLifetimeMs = (days: GuestLinkDays) => days * DAY_MS

export const linkDaysLeft = (
  expiresAt: number | undefined,
  now: number
): GuestLinkDays | null => {
  if (expiresAt === undefined) return null
  const left = expiresAt - now
  return (
    GUEST_LINK_DAYS.find((days) => {
      const whole = days * DAY_MS
      return left <= whole + 5 * 60 * 1000 && left > whole - DAY_MS / 2
    }) ?? null
  )
}
