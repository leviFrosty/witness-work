import { HttpError } from '@/lib/http/request'
import { PasskeyError } from '@/lib/passkeys/errors'
import type {
  PasskeyAssertion,
  PublicKeyCredentialRequestOptionsJSON,
} from '@/lib/passkeys/types'
import type { AccountDevice } from '@/lib/serverAccount/activityClient'
import type {
  PasskeyChallenge,
  PasskeyList,
  PasskeyResponseJSON,
} from '@/lib/serverAccount/passkeyClient'
import { newPasskeyWrapId, wrapAccountKey } from '@/lib/serverAccount/passkeys'
import type { RekeyPasskeyWrap } from '@/lib/serverAccount/keyChangeClient'
import { KeyChangeError } from './engine'

/**
 * How long a browser's session must have been open before it may change the
 * account key (ADR 0039 §2). The server decides; the browser checks first, so
 * the User never saves a new recovery key it would refuse.
 */
export const KEY_CHANGE_SESSION_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Changing the account key in a browser (ADR 0039 §2;
 * docs/account-key-change.md, step 3; docs/passkeys-protocol.md, "Step-up on
 * the web"): a session at least a day old, and a passkey tap the server checks
 * right after "I've saved it", whose PRF output wraps the new key so that
 * passkey unlocks the account again at once.
 */
export type WebKeyChangeDeps = {
  /** Server time (`syncNow`). */
  now: () => number
  randomBytes: (length: number) => Uint8Array
  /** The account's sessions (`GET /sessions`); this browser's is `current`. */
  devices: () => Promise<AccountDevice[]>
  passkeys: () => Promise<Pick<PasskeyList, 'passkeys'>>
  /** `POST /passkeys/challenge` for a step-up. */
  startStepUp: () => Promise<PasskeyChallenge>
  /** The browser's passkey sheet, with the PRF salt evaluated. */
  getPasskey: (
    options: PublicKeyCredentialRequestOptionsJSON
  ) => Promise<PasskeyAssertion>
  /** `POST /passkeys/assert` with the step-up's challenge. */
  finishStepUp: (args: {
    challengeToken: string
    response: PasskeyResponseJSON
  }) => Promise<{ credentialId: string }>
}

/** The passkey check didn't pass: cancelled, or refused by the server. */
const didNotPass = (error: unknown) =>
  error instanceof PasskeyError ||
  (error instanceof HttpError && error.serverCode === 'passkey_failed')

export function createWebKeyChange(deps: WebKeyChangeDeps) {
  return {
    /**
     * Throws `session_too_new` (with when it may) or `no_passkey` when this
     * browser can't change the key yet.
     */
    async precheck(): Promise<void> {
      const [devices, { passkeys }] = await Promise.all([
        deps.devices(),
        deps.passkeys(),
      ])
      const current = devices.find((device) => device.current)
      if (current && deps.now() - current.createdAt < KEY_CHANGE_SESSION_AGE_MS)
        throw new KeyChangeError('session_too_new', {
          availableAt: current.createdAt + KEY_CHANGE_SESSION_AGE_MS,
        })
      if (passkeys.length === 0) throw new KeyChangeError('no_passkey')
    },

    /**
     * The step-up for a change to `newKey` at `keyEpoch` (the epoch it makes),
     * and the passkey's wrap of the new key when it gave PRF output.
     */
    async stepUp({
      newKey,
      accountId,
      keyEpoch,
    }: {
      newKey: Uint8Array
      accountId: string
      keyEpoch: number
    }): Promise<{ passkeyWrap?: RekeyPasskeyWrap }> {
      const challenge = await deps.startStepUp()
      let assertion: PasskeyAssertion
      let credentialId: string
      try {
        assertion = await deps.getPasskey(
          challenge.options as unknown as PublicKeyCredentialRequestOptionsJSON
        )
        ;({ credentialId } = await deps.finishStepUp({
          challengeToken: challenge.challengeToken,
          response: assertion.response as unknown as PasskeyResponseJSON,
        }))
      } catch (error) {
        if (didNotPass(error)) throw new KeyChangeError('step_up')
        throw error
      }
      if (!assertion.prf) return {}
      return {
        passkeyWrap: {
          credentialId,
          wrapId: newPasskeyWrapId(deps.randomBytes),
          wrap: wrapAccountKey(
            {
              accountId,
              credentialId,
              keyEpoch,
              prfOutput: assertion.prf,
              accountKey: newKey,
            },
            deps.randomBytes(24)
          ),
        },
      }
    },
  }
}
