import type { WebCheckout } from '@/features/supporter/lib/webCheckout'

/**
 * Web checkout (`useWebCheckout.web.ts`). Phones sell through their store and
 * never point to the web checkout (docs/web-purchases.md "What phones must
 * never do").
 */
export default function useWebCheckout(): WebCheckout | null {
  return null
}
