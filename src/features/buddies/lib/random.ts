import { getRandomBytes } from 'expo-crypto'

export function randomBytes(length: number): Uint8Array {
  return getRandomBytes(length)
}
