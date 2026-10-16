import { useEffect, useState } from 'react'
import { type AttestationSupport, deviceAttestation } from '@/lib/attestation'

/**
 * Whether this device can attest at all, checked once when the screen opens:
 * null until known. Signing in to an account needs it (ADR 0027).
 */
export default function useAttestationSupport(): AttestationSupport | null {
  const [support, setSupport] = useState<AttestationSupport | null>(null)
  useEffect(() => {
    let live = true
    deviceAttestation.checkSupport().then(
      (result) => {
        if (live) setSupport(result)
      },
      () => {
        if (live) setSupport('unknown')
      }
    )
    return () => {
      live = false
    }
  }, [])
  return support
}
