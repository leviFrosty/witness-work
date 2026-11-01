import { CryptoDigestAlgorithm, digest } from 'expo-crypto'

export async function sha256Native(bytes: Uint8Array): Promise<Uint8Array> {
  const whole =
    bytes.byteOffset === 0 &&
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteLength === bytes.buffer.byteLength
      ? (bytes as Uint8Array<ArrayBuffer>)
      : bytes.slice()
  return new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, whole))
}
