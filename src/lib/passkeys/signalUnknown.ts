type SignalSource = {
  signalUnknownCredential?: (options: {
    rpId: string
    credentialId: string
  }) => Promise<void>
}

type BrandSource = { userAgentData?: { brands?: { brand: string }[] } }

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
