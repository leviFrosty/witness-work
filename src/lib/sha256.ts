import { CryptoDigestAlgorithm, digest } from 'expo-crypto'

/**
 * SHA-256 in native code, for snapshots and blobs: a heavy account's 2 MB
 * backup hashes in about a millisecond here, and blocks the JS thread for about
 * a second with `@noble/hashes`. Same bytes either way; keys and short ids can
 * stay on noble.
 */
export async function sha256Native(bytes: Uint8Array): Promise<Uint8Array> {
  // Native modules may read a view's whole buffer: hand them one that is it.
  const whole =
    bytes.byteOffset === 0 &&
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteLength === bytes.buffer.byteLength
      ? (bytes as Uint8Array<ArrayBuffer>)
      : bytes.slice()
  return new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, whole))
}
