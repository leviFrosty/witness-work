import { useEffect, useState } from 'react'
import Constants from 'expo-constants'
import { getRandomBytes } from 'expo-crypto'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import {
  MONO,
  ToolList,
  ToolRow,
  ToolSubheading,
} from '@/app/navigation/tools/ToolsUI'
import { toB64u } from '@/lib/bytes'
import {
  PasskeyError,
  createPasskey,
  getPasskey,
  passkeySupport,
  passkeysLinked,
  type PasskeySupport,
} from '@/lib/passkeys'

/** The RP ID this build claims (`app.config.ts` associated domains). */
const RP_ID =
  (Constants.expoConfig?.extra as { appVariant?: string } | undefined)
    ?.appVariant === 'development'
    ? 'app-dev.witnesswork.app'
    : 'app.witnesswork.app'

type Outcome = { title: string; detail: string }
type Ceremony = 'create' | 'signIn'

const describe = (error: unknown): Outcome =>
  error instanceof PasskeyError
    ? { title: error.code, detail: error.message }
    : { title: 'error', detail: String(error) }

/**
 * Tools → Account → Passkeys (ADR 0038): whether the module is in this binary,
 * what the platform supports, and a real create and sign-in against this
 * build's RP ID with throwaway options, no server involved. English only.
 */
export default function PasskeyTools() {
  const theme = useTheme()
  const [support, setSupport] = useState<PasskeySupport | null>(null)
  const [busy, setBusy] = useState<Ceremony | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  useEffect(() => {
    void passkeySupport().then(setSupport)
  }, [])

  const run = async (ceremony: Ceremony, action: () => Promise<Outcome>) => {
    setBusy(ceremony)
    setOutcome(null)
    try {
      setOutcome(await action())
    } catch (error) {
      setOutcome(describe(error))
    } finally {
      setBusy(null)
    }
  }

  const create = () =>
    run('create', async () => {
      const userId = toB64u(getRandomBytes(32))
      const { response, prf } = await createPasskey({
        rp: { id: RP_ID, name: 'WitnessWork' },
        user: {
          id: userId,
          name: 'WitnessWork TEST',
          displayName: 'WitnessWork TEST',
        },
        challenge: toB64u(getRandomBytes(32)),
        pubKeyCredParams: [
          { type: 'public-key', alg: -8 },
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
        },
        attestation: 'none',
        timeout: 300_000,
      })
      return {
        title: 'created',
        detail: `id ${response.id}\nprf enabled ${prf.enabled} · output ${prf.first ? `${prf.first.length} B` : 'none'}`,
      }
    })

  const signIn = () =>
    run('signIn', async () => {
      const { response, prf } = await getPasskey({
        rpId: RP_ID,
        challenge: toB64u(getRandomBytes(32)),
        userVerification: 'required',
        timeout: 300_000,
      })
      return {
        title: 'signed in',
        detail: `id ${response.id}\nprf output ${prf ? `${prf.length} B` : 'none'}`,
      }
    })

  return (
    <>
      <ToolSubheading
        title='Passkeys'
        info={`modules/passkeys against RP ID ${RP_ID}, with the PRF salt and throwaway options; nothing reaches ww-api. Needs the host to serve its association files.`}
      />
      <ToolList>
        <ToolRow label='Module linked' value={String(passkeysLinked())} />
        <ToolRow
          label='Support'
          value={
            support ? `passkeys ${support.passkeys} · prf ${support.prf}` : '…'
          }
        />
        <ToolRow
          label={busy === 'create' ? 'Creating…' : `Create on ${RP_ID}`}
          disabled={busy !== null}
          onPress={create}
        />
        <ToolRow
          label={busy === 'signIn' ? 'Signing in…' : `Sign in on ${RP_ID}`}
          disabled={busy !== null}
          onPress={signIn}
        />
        <ToolRow label='Result' value={outcome?.title ?? '—'} />
      </ToolList>
      {outcome ? (
        <Text
          selectable
          testID='passkey-tools-detail'
          style={{
            fontFamily: MONO,
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textAlt,
            paddingBottom: 8,
          }}
        >
          {outcome.detail}
        </Text>
      ) : null}
    </>
  )
}
