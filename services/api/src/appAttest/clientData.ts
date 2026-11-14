/**
 * Canonical client-data the iOS app hashes into each App Attest assertion. The
 * Secure Enclave signs `SHA256(authenticatorData || SHA256(clientData))`, so
 * binding the challenge + identity + content hash here makes every request's
 * signature cover exactly those values — a stolen assertion can't be replayed
 * for a different identity, a different import, or after the challenge expires.
 *
 * `accountId` (the shared account id of witness-work ADR 0011) is folded in
 * only when the client sent one, so pre-account clients — which sign the
 * three-field form — keep verifying. The two forms can't collide: the field
 * count differs and none of the values may contain `|` (the account id is
 * shape-validated at the route, the challenge is server-issued base64url, and
 * the content hash is hex).
 *
 * MUST stay byte-for-byte identical to the witness-work client's builder.
 */
export const buildAssertionClientData = (args: {
  challenge: string
  uuid: string
  accountId?: string
  contentHash: string
}): string =>
  args.accountId
    ? `${args.challenge}|${args.uuid}|${args.accountId}|${args.contentHash}`
    : `${args.challenge}|${args.uuid}|${args.contentHash}`
