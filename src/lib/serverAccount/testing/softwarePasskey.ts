import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { concatBytes, fromB64u, toB64u, utf8 } from '@/lib/bytes'
import { curve25519 } from '@/lib/curve25519'
import type {
  PasskeyCeremonyOptions,
  PasskeyResponseJSON,
} from '@/lib/serverAccount/passkeyClient'
import { PASSKEY_PRF_SALT } from '@/lib/serverAccount/passkeys'

/**
 * A software passkey for the opt-in interop tests: an Ed25519 credential with
 * `none` attestation, user verification, and a PRF that's an HMAC of the salt,
 * so the worker's WebAuthn checks run for real without a device.
 */

type Cbor = number | string | Uint8Array | Cbor[] | Map<Cbor, Cbor>

function head(major: number, value: number): Uint8Array {
  if (value < 24) return new Uint8Array([(major << 5) | value])
  if (value < 0x100) return new Uint8Array([(major << 5) | 24, value])
  if (value < 0x10000)
    return new Uint8Array([(major << 5) | 25, value >> 8, value & 0xff])
  return new Uint8Array([
    (major << 5) | 26,
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ])
}

function cbor(value: Cbor): Uint8Array {
  if (typeof value === 'number')
    return value >= 0 ? head(0, value) : head(1, -1 - value)
  if (typeof value === 'string') {
    const bytes = utf8(value)
    return concatBytes(head(3, bytes.length), bytes)
  }
  if (value instanceof Uint8Array)
    return concatBytes(head(2, value.length), value)
  if (Array.isArray(value))
    return concatBytes(head(4, value.length), ...value.map(cbor))
  return concatBytes(
    head(5, value.size),
    ...[...value].flatMap(([key, entry]) => [cbor(key), cbor(entry)])
  )
}

const UP = 0x01
const UV = 0x04
const BE = 0x08
const BS = 0x10
const AT = 0x40

export function createSoftwarePasskey(
  randomBytes: (length: number) => Uint8Array,
  { rpId, origin }: { rpId: string; origin: string }
) {
  const seed = randomBytes(32)
  const publicKey = curve25519().ed25519.getPublicKey(seed)
  const credentialId = randomBytes(16)
  const prfSecret = randomBytes(32)
  let userHandle: string | null = null
  const rpIdHash = sha256(utf8(rpId))

  const clientData = (type: string, options: PasskeyCeremonyOptions) =>
    utf8(
      JSON.stringify({
        type,
        challenge: options.challenge,
        origin,
        crossOrigin: false,
      })
    )

  const prf = () => ({
    prf: {
      results: { first: toB64u(hmac(sha256, prfSecret, PASSKEY_PRF_SALT)) },
    },
  })

  return {
    credentialId: toB64u(credentialId),
    get userHandle() {
      return userHandle
    },
    /** What `prf.results.first` would be. */
    prfOutput: () => hmac(sha256, prfSecret, PASSKEY_PRF_SALT),

    create(options: PasskeyCeremonyOptions): PasskeyResponseJSON {
      const user = options.user as { id: string }
      userHandle = user.id
      const cose = cbor(
        new Map<Cbor, Cbor>([
          [1, 1],
          [3, -8],
          [-1, 6],
          [-2, publicKey],
        ])
      )
      const authData = concatBytes(
        rpIdHash,
        new Uint8Array([UP | UV | BE | BS | AT]),
        new Uint8Array(4),
        new Uint8Array(16),
        new Uint8Array([credentialId.length >> 8, credentialId.length & 0xff]),
        credentialId,
        cose
      )
      const attestationObject = cbor(
        new Map<Cbor, Cbor>([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', authData],
        ])
      )
      return {
        id: toB64u(credentialId),
        rawId: toB64u(credentialId),
        type: 'public-key',
        response: {
          clientDataJSON: toB64u(clientData('webauthn.create', options)),
          attestationObject: toB64u(attestationObject),
          transports: ['internal'],
        },
        clientExtensionResults: { prf: { enabled: true } },
        authenticatorAttachment: 'platform',
      }
    },

    get(options: PasskeyCeremonyOptions): PasskeyResponseJSON {
      if (!userHandle) throw new Error('Create the passkey first')
      const authenticatorData = concatBytes(
        rpIdHash,
        new Uint8Array([UP | UV | BE | BS]),
        new Uint8Array(4)
      )
      const clientDataJSON = clientData('webauthn.get', options)
      const signature = curve25519().ed25519.sign(
        concatBytes(authenticatorData, sha256(clientDataJSON)),
        seed
      )
      return {
        id: toB64u(credentialId),
        rawId: toB64u(credentialId),
        type: 'public-key',
        response: {
          clientDataJSON: toB64u(clientDataJSON),
          authenticatorData: toB64u(authenticatorData),
          signature: toB64u(signature),
          userHandle,
        },
        clientExtensionResults: prf(),
        authenticatorAttachment: 'platform',
      }
    },

    /** The handle as bytes, for checking the tag. */
    userHandleBytes: () => (userHandle ? fromB64u(userHandle) : null),
  }
}
