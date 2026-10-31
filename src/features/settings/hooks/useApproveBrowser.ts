import { useEffect, useState } from 'react'
import {
  type ApprovalEntry,
  endApproval,
  startPhoneApproval,
} from '@/app/account/approval'
import type { OfferStartProblem } from '@/app/account/handoff'
import { logger } from '@/lib/logger'
import type { PhoneApproval } from '@/lib/serverAccount/approvalSession'
import {
  useHandoffPolling,
  useHandoffState,
} from '@/features/settings/hooks/useHandoffSession'

type Start =
  | { phase: 'scanning' }
  | { phase: 'starting' }
  | { phase: 'problem'; problem: OfferStartProblem }
  | { phase: 'ready'; session: PhoneApproval }

/**
 * Sign In on a Computer's approval: scans until there's a code, then claims it
 * with this phone's account, polls while the User decides (so a browser that
 * left or a code that expired shows at once), and ends the claim when the
 * screen closes or the User scans again. `link` is a code handed in by a
 * development build instead of the camera.
 */
export default function useApproveBrowser(entry: ApprovalEntry, link?: string) {
  const [scanned, setScanned] = useState<string | null>(link ?? null)
  const [attempt, setAttempt] = useState(0)
  const [start, setStart] = useState<Start>({ phase: 'scanning' })

  useEffect(() => {
    if (link) setScanned(link)
  }, [link])

  useEffect(() => {
    if (!scanned) {
      setStart({ phase: 'scanning' })
      return
    }
    let live = true
    let session: PhoneApproval | null = null
    setStart({ phase: 'starting' })
    startPhoneApproval(scanned, entry)
      .then((result) => {
        if (!result.ok) {
          if (live) setStart({ phase: 'problem', problem: result.problem })
          return
        }
        session = result.session
        if (live) setStart({ phase: 'ready', session })
        else void endApproval(session)
      })
      .catch((error: unknown) => {
        logger.warn('[approval] starting failed', error)
        if (live) setStart({ phase: 'problem', problem: 'offline' })
      })
    return () => {
      live = false
      if (session) void endApproval(session)
    }
  }, [scanned, attempt, entry])

  const session = start.phase === 'ready' ? start.session : null
  const state = useHandoffState(session)
  useHandoffPolling(session, state?.step === 'confirm')

  return {
    start,
    session,
    state,
    /** A code the scanner took. */
    scan: setScanned,
    /** Back to the scanner, for the computer's next code. */
    scanAgain: () => setScanned(null),
    /** The same code again, after the account's session couldn't open. */
    retry: () => setAttempt((count) => count + 1),
    /** The web app's host the code came from, for the "only yours" line. */
    host: scanned ? hostOf(scanned) : '',
  }
}

const hostOf = (link: string) => {
  try {
    return new URL(link).host
  } catch {
    return ''
  }
}
