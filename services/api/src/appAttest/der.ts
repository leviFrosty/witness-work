/**
 * Minimal DER reader — just enough to pull the nonce out of Apple's App Attest
 * certificate extension (OID 1.2.840.113635.100.8.2). That extension's value is
 *
 *   SEQUENCE { [1] EXPLICIT { OCTET STRING nonce(32) } }
 *
 * We descend SEQUENCE → context-[1] → OCTET STRING and return the 32-byte nonce.
 */

interface Tlv {
  tag: number
  contents: Uint8Array
  /** Offset in the parent buffer just past this TLV. */
  end: number
}

const readTlv = (buf: Uint8Array, offset: number): Tlv => {
  if (offset + 2 > buf.length) throw new DerError('truncated TLV header')
  const tag = buf[offset]
  let lenByte = buf[offset + 1]
  let cursor = offset + 2
  let length: number
  if (lenByte < 0x80) {
    length = lenByte
  } else {
    const numBytes = lenByte & 0x7f
    if (numBytes === 0 || numBytes > 4) throw new DerError('unsupported length')
    if (cursor + numBytes > buf.length) throw new DerError('truncated length')
    length = 0
    for (let i = 0; i < numBytes; i++) length = (length << 8) | buf[cursor++]
  }
  const contentStart = cursor
  const contentEnd = contentStart + length
  if (contentEnd > buf.length) throw new DerError('content overflow')
  return {
    tag,
    contents: buf.subarray(contentStart, contentEnd),
    end: contentEnd,
  }
}

/**
 * Extracts the 32-byte attestation nonce from the raw value of Apple's App
 * Attest credential-certificate extension.
 */
export const extractAttestationNonce = (extensionValue: Uint8Array): Uint8Array => {
  const seq = readTlv(extensionValue, 0)
  if (seq.tag !== 0x30) throw new DerError('expected SEQUENCE')
  const ctx = readTlv(seq.contents, 0)
  // Context-specific [1] constructed = 0xA1.
  if (ctx.tag !== 0xa1) throw new DerError('expected [1] context tag')
  const octet = readTlv(ctx.contents, 0)
  if (octet.tag !== 0x04) throw new DerError('expected OCTET STRING')
  if (octet.contents.length !== 32) throw new DerError('nonce is not 32 bytes')
  return octet.contents
}

/**
 * Converts a DER-encoded ECDSA signature (`SEQUENCE { INTEGER r, INTEGER s }`)
 * into the fixed 64-byte raw `r||s` form WebCrypto's ECDSA verify expects for
 * P-256. App Attest assertions are DER; WebCrypto wants IEEE P1363.
 */
export const derEcdsaSignatureToRaw = (der: Uint8Array): Uint8Array => {
  const seq = readTlv(der, 0)
  if (seq.tag !== 0x30) throw new DerError('expected SEQUENCE')
  const rTlv = readTlv(seq.contents, 0)
  if (rTlv.tag !== 0x02) throw new DerError('expected INTEGER r')
  const sTlv = readTlv(seq.contents, rTlv.end)
  if (sTlv.tag !== 0x02) throw new DerError('expected INTEGER s')

  const out = new Uint8Array(64)
  writeFixedInt(out, 0, rTlv.contents)
  writeFixedInt(out, 32, sTlv.contents)
  return out
}

/** Left-pads/strips a DER INTEGER to exactly 32 bytes at `out[offset..offset+32]`. */
const writeFixedInt = (
  out: Uint8Array,
  offset: number,
  intBytes: Uint8Array
): void => {
  // Strip a leading 0x00 sign byte; reject anything that won't fit in 32 bytes.
  let bytes = intBytes
  while (bytes.length > 1 && bytes[0] === 0x00) bytes = bytes.subarray(1)
  if (bytes.length > 32) throw new DerError('integer exceeds 32 bytes')
  out.set(bytes, offset + (32 - bytes.length))
}

export class DerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DerError'
  }
}
