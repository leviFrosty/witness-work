import { useEffect, useState } from 'react'
import { Alert, Platform, View } from 'react-native'
import { KeyRound as KeyRoundIcon } from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import { getRandomBytes } from 'expo-crypto'
import moment from 'moment'
import { toast } from '@/stores/toasts'
import * as BuddiesKeychain from '../../../../modules/buddies-keychain'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import apis from '@/constants/apis'
import { accountKey, replaceAccountKey } from '@/app/account/accountKey'
import {
  ToolList,
  ToolRow,
  ToolSection,
  ToolSubheading,
} from '@/app/navigation/tools/ToolsUI'
import { losesSomething } from '@/lib/accountKey/accountKey'
import {
  encodeRecoveryKey,
  parseRecoveryKey,
} from '@/lib/accountKey/recoveryKey'
import { HttpError } from '@/lib/http/request'
import {
  cachedServerAccount,
  fetchServerAccountInfo,
  serverAccount,
} from '@/lib/serverAccount'
import type { ServerAccountInfo } from '@/lib/serverAccount/client'
import type { SupporterStatus } from '@/lib/serverAccount/revenueCatLink'
import { revenueCatLink } from '@/lib/serverAccount/revenueCatLinkRuntime'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import HandoffTools from '@/app/navigation/tools/HandoffTools'
import BackupTools from '@/app/navigation/tools/BackupTools'
import JsonViewer from '@/features/contacts/components/JsonViewer'
import { deriveIdentity } from '@/features/buddies/lib/keys'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

const shortId = (value: string | null | undefined) =>
  value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—'

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, i) => byte === b[i])

/** An error as Tools shows it: the server's code when there is one. */
const describeError = (error: unknown) =>
  error instanceof HttpError
    ? `${error.serverCode ?? error.kind}${error.status ? ` (${error.status})` : ''}`
    : String(error)

const when = (at: number | null | undefined) =>
  at ? moment(at).format('YYYY-MM-DD HH:mm:ss') : '—'

type Lookup =
  | { state: 'idle' }
  | { state: 'ok'; info: ServerAccountInfo; at: number }
  | { state: 'failed'; reason: string; at: number }

/** The key's facts, read off the JS thread. */
type KeyFacts = {
  key: Uint8Array | null
  error: string | null
}

/**
 * The account key and server account (ADR 0024, 0026): what this device holds,
 * what the server says, and the real flows to change them, then Set Up Another
 * Device's handoff, then the backup.
 */
export default function AccountTools() {
  const [facts, setFacts] = useState<KeyFacts>({ key: null, error: null })
  const [revision, setRevision] = useState(0)
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' })
  const [busy, setBusy] = useState<string | null>(null)
  const [supporter, setSupporter] = useState<
    (SupporterStatus & { at: number }) | null
  >(null)
  const [lastLink, setLastLink] = useState<string | null>(null)
  const registeredInboxId = useBuddies((state) => state.registeredInboxId)
  const linkedInboxId = useBuddies((state) => state.accountLinkedInboxId)

  const reload = () => setRevision((value) => value + 1)
  const say = (title: string, message = '') => toast.info(title, { message })

  useEffect(() => {
    let live = true
    accountKey
      .peek()
      .then((key) => live && setFacts({ key, error: null }))
      .catch(
        (error: unknown) =>
          live && setFacts({ key: null, error: describeError(error) })
      )
    return () => {
      live = false
    }
  }, [revision])

  const key = facts.key
  const accountPub = key ? deriveAccountSigningKey(key).publicKey : null
  const inboxId = key ? deriveIdentity(key).inboxId : null
  const cached = cachedServerAccount()
  const info = lookup.state === 'ok' ? lookup.info : null
  const cachedMatches = !!cached && cached.accountPub === accountPub
  const backup = BuddiesKeychain.rootSeedBackup()

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label)
    try {
      await action()
    } catch (error) {
      say(`${label} failed`, describeError(error))
    } finally {
      setBusy(null)
      reload()
    }
  }

  const fetchFromServer = () =>
    run('Fetch from server', async () => {
      // Peek, never create: reading the server mustn't mint an account key.
      if (!key) throw new Error('No account key on this device')
      try {
        const answer = await fetchServerAccountInfo(key)
        setLookup({ state: 'ok', info: answer, at: Date.now() })
        if (answer.accountPub !== accountPub)
          say('Key mismatch', 'The server answered for another key')
      } catch (error) {
        setLookup({
          state: 'failed',
          reason: describeError(error),
          at: Date.now(),
        })
        throw error
      }
    })

  const registerNow = () =>
    run('Register', async () => {
      const current = await accountKey.getOrCreate()
      serverAccount.forget()
      const account = await serverAccount.ensure(current)
      say(
        account ? 'Registered' : 'Not registered',
        account ? shortId(account.accountId) : 'Offline, or accounts off'
      )
    })

  // Reads open a session when there's none, as any bearer call does.
  const fetchSupporter = () =>
    run('Read Supporter status', async () => {
      setSupporter({ ...(await revenueCatLink.fetchStatus()), at: Date.now() })
    })

  const linkRevenueCat = () =>
    run('Link RevenueCat', async () => {
      const outcome = await revenueCatLink.ensure({
        force: true,
        open: true,
        reason: 'tools',
      })
      setLastLink(`${outcome.result} · ${when(Date.now())}`)
      say('Link RevenueCat', outcome.result)
    })

  const copyRecoveryKey = () =>
    Alert.alert(
      'Copy recovery key?',
      'Anyone with it has this account. Dev builds only.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Copy',
          onPress: () =>
            void run('Copy', async () => {
              if (!key) throw new Error('No account key on this device')
              await Clipboard.setStringAsync(encodeRecoveryKey(key))
              say('Recovery key copied')
            }),
        },
      ]
    )

  const replaceWithRandom = async () => {
    const newKey = getRandomBytes(32)
    const loss = await accountKey.lossIfReplaced(newKey)
    Alert.alert(
      'Replace with a random key?',
      [
        'Runs the real replace flow: this device gets a new account.',
        losesSomething(loss)
          ? `Delete Buddies runs first: ${loss.buddies} buddies, inbox ${loss.inboxRegistered ? 'registered' : 'none'}.`
          : 'No Buddies data to delete.',
        Platform.OS === 'ios'
          ? 'Reaches the other Apple devices on this iCloud Keychain.'
          : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: () =>
            void run('Replace', async () => {
              const result = await replaceAccountKey(newKey, {
                source: 'tools',
                confirmedLoss: true,
              })
              say(
                result.outcome === 'replaced' ? 'Replaced' : 'Unchanged',
                result.outcome === 'replaced'
                  ? `account ${shortId(result.accountId)}`
                  : ''
              )
            }),
        },
      ]
    )
  }

  return (
    <ToolSection
      title='Account'
      icon={KeyRoundIcon}
      tone={info?.status === 'suspended' ? 'destructive' : 'default'}
      summary={
        facts.error
          ? 'key error'
          : !key
            ? 'no key'
            : cachedMatches && cached?.accountId
              ? `${cached.status ?? 'registered'} · ${shortId(cached.accountId)}`
              : 'not registered'
      }
    >
      <ToolSubheading
        title='Account key'
        info='32 random bytes, today the Buddies root seed. iOS keeps it in a synchronizable iCloud Keychain item; Android seals it under the Keystore and backs it up through Block Store. Everything else here derives from it.'
      />
      <ToolList>
        <ToolRow
          label='Key present'
          value={facts.error ? `error: ${facts.error}` : key ? 'yes' : 'no'}
        />
        <ToolRow
          label='Source'
          value={
            Platform.OS === 'ios'
              ? 'iCloud Keychain (synchronizable)'
              : `Block Store: ${backup ?? '—'}`
          }
        />
        <ToolRow
          label='Can replace'
          info='Version 3 of the buddies-keychain module adds replaceRootSeed.'
          value={BuddiesKeychain.isReplaceAvailable() ? 'yes' : 'no'}
        />
        <ToolRow label='accountPub' value={shortId(accountPub)} />
        <ToolRow label='Reload' onPress={reload} />
      </ToolList>

      <ToolSubheading
        title='Server account'
        info='The id the server minted for accountPub, cached in MMKV `server-account`. A cache for a different accountPub means the key changed and the next use registers again.'
      />
      <ToolList>
        <ToolRow label='Accounts API' value={apis.accounts} />
        <ToolRow
          label='Cached accountId'
          value={
            cached?.accountId
              ? `${shortId(cached.accountId)}${cachedMatches ? '' : ' (other key)'}`
              : '—'
          }
        />
        <ToolRow
          label='Cached status'
          value={
            cached?.unavailableUntil
              ? `off until ${new Date(cached.unavailableUntil).toISOString()}`
              : (cached?.status ?? '—')
          }
        />
        <ToolRow
          label={
            busy === 'Fetch from server' ? 'Fetching…' : 'Fetch from server'
          }
          info='POST /accounts/v1/account/info, signed by the account key: what the database holds for this key, without creating an account (404 unknown_account when it has none). Status changes come without their reasons, which stay with moderation.'
          disabled={!key || busy !== null}
          onPress={fetchFromServer}
        />
        <ToolRow
          label={busy === 'Register' ? 'Registering…' : 'Register now'}
          info='Forgets the cache and runs account/register (creating the key if there is none). Idempotent on the server.'
          disabled={busy !== null}
          onPress={registerNow}
        />
        <ToolRow
          label='Forget cached account'
          tone='destructive'
          disabled={!cached}
          onPress={() => {
            serverAccount.forget()
            say('Cached account forgotten')
            reload()
          }}
        />
      </ToolList>
      {lookup.state === 'failed' && (
        <ToolRow
          label='Server answer'
          tone='destructive'
          value={`${lookup.reason} · ${when(lookup.at)}`}
        />
      )}
      {info && (
        <ToolList>
          <ToolRow
            label='Server status'
            tone={info.status === 'suspended' ? 'destructive' : 'default'}
            value={info.status}
          />
          <ToolRow
            label='Matches cache'
            value={cached?.accountId === info.accountId ? 'yes' : 'no'}
          />
          <ToolRow label='Created' value={when(info.createdAt)} />
          <ToolRow
            label='Linked inboxes'
            value={`${info.inboxIds.length}${inboxId && info.inboxIds.includes(inboxId) ? ' (incl. this key’s)' : ''}`}
          />
          <ToolRow
            label='Status changes'
            value={String(info.statusChanges.length)}
          />
        </ToolList>
      )}
      <View style={{ paddingTop: 8, gap: 8 }}>
        <JsonViewer label='Cached (MMKV server-account)' value={cached} />
        {lookup.state === 'ok' && (
          <JsonViewer
            label='Server record'
            value={{
              fetchedAt: new Date(lookup.at).toISOString(),
              ...lookup.info,
              createdAt: new Date(lookup.info.createdAt).toISOString(),
              statusChanges: lookup.info.statusChanges.map((change) => ({
                ...change,
                createdAt: new Date(change.createdAt).toISOString(),
              })),
            }}
          />
        )}
      </View>

      <ToolSubheading
        title='Buddies link'
        info='The inbox id derived from this key, and whether this device registered it and linked it to the account (inbox/register with the account proof).'
      />
      <ToolList>
        <ToolRow label='Inbox from key' value={shortId(inboxId)} />
        <ToolRow
          label='Registered inbox'
          value={
            registeredInboxId
              ? `${shortId(registeredInboxId)}${registeredInboxId === inboxId ? '' : ' (other key)'}`
              : '—'
          }
        />
        <ToolRow
          label='Linked to account'
          value={inboxId && linkedInboxId === inboxId ? 'yes' : 'no'}
        />
      </ToolList>

      <ToolSubheading
        title='Supporter on the server'
        info='ADR 0029: ww-api answers Supporter status from the RevenueCat customers this account linked (POST /accounts/v1/revenuecat-customers), kept current by RevenueCat’s webhook. Linking sends the id RevenueCat is logged in as; the server reads the customer itself.'
      />
      <ToolList>
        <ToolRow
          label='Server Supporter'
          value={
            supporter
              ? `${String(supporter.supporter)} · ${supporter.customers} linked · ${when(supporter.at)}`
              : '—'
          }
        />
        <ToolRow
          label='Server ends'
          value={
            supporter?.supporter
              ? supporter.expiresAt
                ? when(supporter.expiresAt)
                : 'never'
              : '—'
          }
        />
        <ToolRow label='Last link here' value={lastLink ?? '—'} />
        <ToolRow
          label={
            busy === 'Read Supporter status'
              ? 'Reading…'
              : 'Read Supporter status'
          }
          info='GET /accounts/v1/supporter.'
          disabled={busy !== null}
          onPress={fetchSupporter}
        />
        <ToolRow
          label={
            busy === 'Link RevenueCat' ? 'Linking…' : 'Link RevenueCat now'
          }
          info='Links now, skipping the daily wait and any 503 backoff.'
          disabled={busy !== null}
          onPress={linkRevenueCat}
        />
      </ToolList>

      <ToolSubheading
        title='Recovery key'
        info='WW1- and 11 groups of 5 Crockford base32 characters: the key and the first 2 bytes of its SHA-256.'
      />
      <RecoveryKeyValidator currentKey={key} />
      <ToolList>
        {__DEV__ && (
          <ToolRow
            label='Copy recovery key'
            disabled={!key}
            onPress={copyRecoveryKey}
          />
        )}
        <ToolRow
          label={
            busy === 'Replace' ? 'Replacing…' : 'Replace with a random key'
          }
          tone='destructive'
          info='Runs the same replace as Use a Recovery Key: Delete Buddies first when there is anything to leave, then the new key, a new account, and a fresh Buddies identity.'
          disabled={busy !== null || !BuddiesKeychain.isReplaceAvailable()}
          onPress={replaceWithRandom}
        />
      </ToolList>

      <HandoffTools />
      <BackupTools />
    </ToolSection>
  )
}

/** Paste a recovery key: what's wrong with it, or whose key it is. */
function RecoveryKeyValidator({
  currentKey,
}: {
  currentKey: Uint8Array | null
}) {
  const theme = useTheme()
  const [value, setValue] = useState('')
  const parsed = parseRecoveryKey(value)
  const result = parsed.ok
    ? `valid · ${currentKey && sameBytes(parsed.accountKey, currentKey) ? 'this key' : 'another key'} · pub ${shortId(deriveAccountSigningKey(parsed.accountKey).publicKey)}`
    : parsed.problem
  return (
    <View style={{ gap: 6, paddingVertical: 6 }}>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder='Paste a recovery key to validate'
        autoCapitalize='characters'
        autoCorrect={false}
        style={{ minHeight: 36, borderColor: theme.colors.border }}
      />
      <ToolRow label='Validation' value={value ? result : '—'} />
    </View>
  )
}
