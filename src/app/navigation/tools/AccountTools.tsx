import { useState } from 'react'
import { View } from 'react-native'
import { Fingerprint as FingerprintIcon } from 'lucide-react-native'
import moment from 'moment'
import { useToastController } from '@tamagui/toast'
import * as BuddiesKeychain from '../../../../modules/buddies-keychain'
import apis from '@/constants/apis'
import JsonViewer from '@/features/contacts/components/JsonViewer'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { fromB64u } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import {
  cachedServerAccount,
  fetchServerAccountInfo,
  serverAccount,
} from '@/lib/serverAccount'
import type { ServerAccountInfo } from '@/lib/serverAccount/client'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  ToolList,
  ToolRow,
  ToolSection,
  ToolSubheading,
} from '@/app/navigation/tools/ToolsUI'

const shortKey = (value: string | null | undefined) =>
  value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—'

const when = (at: number | null | undefined) =>
  at ? moment(at).format('YYYY-MM-DD HH:mm:ss') : '—'

const failureReason = (error: unknown) =>
  error instanceof HttpError
    ? (error.serverCode ??
      `${error.kind}${error.status ? ` ${error.status}` : ''}`)
    : String(error)

type Lookup =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ok'; info: ServerAccountInfo; at: number }
  | { state: 'failed'; reason: string; at: number }

/**
 * The server account (ADR 0024): what this device remembers, and what the
 * accounts database holds, read with `account/info`. That op is signed by the
 * account key, so it only ever shows this User's own account. The id isn't a
 * secret; the account key is, and nothing here shows it.
 */
export default function AccountTools() {
  const toast = useToastController()
  const inboxId = useBuddies((state) => state.registeredInboxId)
  const [cached, setCached] = useState(cachedServerAccount)
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' })

  const say = (title: string, message = '') =>
    toast.show(title, { message, native: true })

  const fetchInfo = async () => {
    setLookup({ state: 'loading' })
    setCached(cachedServerAccount())
    try {
      // Peek, never create: the tools mustn't mint an account key.
      const seed = await BuddiesKeychain.peekRootSeed()
      if (!seed) {
        setLookup({ state: 'failed', reason: 'no account key', at: Date.now() })
        return
      }
      const accountKey = fromB64u(seed)
      const info = await fetchServerAccountInfo(accountKey)
      setLookup({ state: 'ok', info, at: Date.now() })
      if (deriveAccountSigningKey(accountKey).publicKey !== info.accountPub)
        say('Key mismatch', 'The server answered for another key')
    } catch (error) {
      const reason = failureReason(error)
      setLookup({ state: 'failed', reason, at: Date.now() })
      say('Account lookup failed', reason)
    }
  }

  const forget = () => {
    serverAccount.forget()
    setCached(cachedServerAccount())
    say('Cached account forgotten', 'It registers again on the next sync')
  }

  const info = lookup.state === 'ok' ? lookup.info : null
  const inboxLinked =
    info && inboxId ? (info.inboxIds.includes(inboxId) ? 'yes' : 'no') : '—'
  const cacheMatches =
    info && cached?.accountId
      ? cached.accountId === info.accountId
        ? 'yes'
        : 'no'
      : '—'

  return (
    <ToolSection
      title='Server account'
      icon={FingerprintIcon}
      info='The anonymous account ww-api keeps in D1 (ADR 0024). Fetch reads it with account/info, signed by the account key, so only this User’s own account is ever shown. It never registers one.'
      summary={
        info
          ? info.status
          : cached?.accountId
            ? 'cached'
            : cached?.unavailableUntil
              ? 'accounts off'
              : 'none'
      }
      tone={info?.status === 'suspended' ? 'destructive' : 'default'}
    >
      <ToolSubheading
        title='On this device'
        info='Kept in device-local MMKV, never synced. The account id is what /admin/accounts/lookup takes.'
      />
      <ToolList>
        <ToolRow label='Worker' value={apis.accounts} />
        <ToolRow label='Account id' value={cached?.accountId ?? '—'} />
        <ToolRow
          label='Account public key'
          value={shortKey(cached?.accountPub)}
        />
        {cached?.unavailableUntil ? (
          <ToolRow
            label='Accounts off until'
            value={when(cached.unavailableUntil)}
          />
        ) : null}
        <ToolRow label='Buddies inbox' value={shortKey(inboxId)} />
        <ToolRow
          label='Forget cached account'
          info='Clears the cached id; the next Buddies sync registers again and gets the same id back.'
          disabled={!cached}
          onPress={forget}
        />
      </ToolList>

      <ToolSubheading
        title='On the server'
        info='POST /accounts/v1/account/info. Status changes are listed without their reasons, which stay with moderation.'
      />
      <ToolList>
        <ToolRow
          label={lookup.state === 'loading' ? 'Fetching…' : 'Fetch from server'}
          disabled={lookup.state === 'loading'}
          onPress={() => void fetchInfo()}
        />
        {lookup.state === 'failed' && (
          <ToolRow
            label='Result'
            tone='destructive'
            value={`${lookup.reason} · ${when(lookup.at)}`}
          />
        )}
        {info && (
          <>
            <ToolRow
              label='Status'
              tone={info.status === 'suspended' ? 'destructive' : 'default'}
              value={info.status}
            />
            <ToolRow label='Account id' value={info.accountId} />
            <ToolRow label='Matches cache' value={cacheMatches} />
            <ToolRow label='Created' value={when(info.createdAt)} />
            <ToolRow
              label='Linked inboxes'
              value={String(info.inboxIds.length)}
            />
            <ToolRow label='This inbox linked' value={inboxLinked} />
            <ToolRow
              label='Status changes'
              value={String(info.statusChanges.length)}
            />
          </>
        )}
      </ToolList>
      {lookup.state === 'ok' && (
        <View style={{ paddingTop: 8 }}>
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
        </View>
      )}
    </ToolSection>
  )
}
