import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { APP_LINK_HOSTS, isOwnAppLink } from '@/constants/appLinks'
import {
  APPROVAL_DEV_ORIGINS,
  APPROVAL_PRODUCTION_ORIGINS,
  buildApprovalLink,
  createApprovalOffer,
} from '@/lib/serverAccount/approval'
import { isHandoffLink } from '@/lib/serverAccount/handoff'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

// A computer's approval code is read only by the app's own scanner (Sign In on
// a Computer): opened from the system camera or a link, it must never reach
// the app, let alone claim (docs/passkeys-protocol.md, "The QR code").

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))

describe('approval links', () => {
  const links = [...APPROVAL_PRODUCTION_ORIGINS, ...APPROVAL_DEV_ORIGINS].map(
    (origin) => buildApprovalLink(createApprovalOffer(random).offer, origin)
  )

  it('are on hosts the app never claims', () => {
    for (const link of links) {
      expect(APP_LINK_HOSTS).not.toContain(new URL(link).host)
      expect(isOwnAppLink(link)).toBe(false)
    }
  })

  it('are not handoff links, so no link listener routes them', () => {
    for (const link of links) expect(isHandoffLink(link)).toBe(false)
  })
})
