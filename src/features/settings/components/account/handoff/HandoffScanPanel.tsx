import type { TranslationKey } from '@/lib/locales'
import { isApprovalLink } from '@/lib/serverAccount/approval'
import {
  type HandoffOffer,
  parseHandoffLink,
  type ParsedHandoffLink,
} from '@/lib/serverAccount/handoff'
import QrScanPanel from '@/features/settings/components/account/handoff/QrScanPanel'

const PROBLEM: Record<
  Extract<ParsedHandoffLink, { ok: false }>['problem'],
  TranslationKey
> = {
  notHandoff: 'handoff_scanNotHandoff',
  version: 'handoff_scanVersion',
  damaged: 'handoff_scanDamaged',
}

/** Scans the other phone's code. */
export default function HandoffScanPanel({
  onOffer,
}: {
  onOffer: (offer: HandoffOffer) => void
}) {
  const read = (data: string): TranslationKey | null => {
    const parsed = parseHandoffLink(data)
    if (!parsed.ok)
      // A computer's code is approved from the phone with the account.
      return isApprovalLink(data)
        ? 'handoff_scanApprovalCode'
        : PROBLEM[parsed.problem]
    onOffer(parsed.offer)
    return null
  }
  return (
    <QrScanPanel
      read={read}
      hint='handoff_scanHint'
      deniedBody='handoff_cameraDeniedBody'
      testIDPrefix='handoff'
    />
  )
}
