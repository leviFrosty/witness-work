import * as Crypto from 'expo-crypto'

/**
 * Canonical content hash of the source notes: lowercase hex SHA-256 of the
 * UTF-8 text. MUST stay byte-for-byte identical to the proxy's `sha256Hex` so
 * the credit meter (which hashes the notes it receives) and the client ledger
 * agree on one identity for a given paste (decisions 6 & 8).
 */
export const notesContentHash = (notesText: string): Promise<string> =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, notesText, {
    encoding: Crypto.CryptoEncoding.HEX,
  })
