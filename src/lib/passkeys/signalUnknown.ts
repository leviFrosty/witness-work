type SignalSource = {
  signalUnknownCredential?: (options: {
    rpId: string
    credentialId: string
  }) => Promise<void>
}

type BrandSource = { userAgentData?: { brands?: { brand: string }[] } }

/**
 * Asks the browser's password manager to forget a passkey the account removed
 * (docs/passkeys-protocol.md, "Passkeys on phones"). Chromium browsers only:
 * Apple platforms aren't asked until WebKit's bug that drops other accounts'
 * passkeys is fixed. Best effort; returns whether it asked.
 */
export function signalRemovedPasskey(
  rpId: string,
  credentialId: string,
  env: { credential?: unknown; navigator?: unknown } = {
    credential: globalThis.PublicKeyCredential,
    navigator: globalThis.navigator,
  }
): boolean {
  const brands = (env.navigator as BrandSource | undefined)?.userAgentData
    ?.brands
  if (!brands?.some(({ brand }) => brand === 'Chromium')) return false
  const signal = (env.credential as SignalSource | undefined)
    ?.signalUnknownCredential
  if (typeof signal !== 'function') return false
  void signal
    .call(env.credential, { rpId, credentialId })
    .catch(() => undefined)
  return true
}
