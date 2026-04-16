import { CustomerInfo } from 'react-native-purchases'

/**
 * Earliest active-subscription purchase date, or null when the user has no
 * active subscription. One-time donations do not grant supporter status.
 */
export const supporterSinceDate = (
  customer: CustomerInfo | null
): Date | null => {
  const active = customer?.entitlements?.active
  if (!active) return null
  let earliest: number | null = null
  for (const entitlement of Object.values(active)) {
    const t = new Date(entitlement.originalPurchaseDate).getTime()
    if (!isNaN(t) && (earliest === null || t < earliest)) earliest = t
  }
  return earliest ? new Date(earliest) : null
}
