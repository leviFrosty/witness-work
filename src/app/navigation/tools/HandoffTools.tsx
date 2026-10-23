import { useState } from 'react'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import * as Clipboard from 'expo-clipboard'
import moment from 'moment'
import { toast } from '@/stores/toasts'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import { useHandoffDebug } from '@/app/account/handoff'
import {
  runHandoffSelfTest,
  type SelfTestStep,
} from '@/app/account/handoffSelfTest'
import {
  MONO,
  ToolList,
  ToolRow,
  ToolSubheading,
} from '@/app/navigation/tools/ToolsUI'
import {
  formatHandoffCode,
  parseHandoffLink,
} from '@/lib/serverAccount/handoff'
import type { HandoffDebugSnapshot } from '@/lib/serverAccount/handoffSession'
import type { RootStackNavigation } from '@/types/rootStack'

const shortId = (value: string | null | undefined) =>
  value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—'

const clock = (at: number) => moment(at).format('HH:mm:ss.SSS')

/** The channel id is shown and copied only in dev builds. */
const channelShown = (id: string | null) =>
  id ? (__DEV__ ? id : shortId(id)) : '—'

/** The snapshot as copied for a bug report: codes and times, no secrets. */
const dump = (snapshot: HandoffDebugSnapshot, entry: string | null) =>
  JSON.stringify(
    {
      ...snapshot,
      entry,
      channelId: channelShown(snapshot.channelId),
      expiresAt: snapshot.expiresAt
        ? new Date(snapshot.expiresAt).toISOString()
        : null,
      events: snapshot.events.map((event) => ({
        ...event,
        at: new Date(event.at).toISOString(),
      })),
    },
    null,
    2
  )

/**
 * Tools → Account → Handoff (ADR 0026): the current or last Set Up Another
 * Device session on this phone, with its request log, plus a self-test, a link
 * parser, and shortcuts into both screens. For debugging a real two-phone
 * attempt: start it from the screens, then come back here on each phone.
 */
export default function HandoffTools() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const session = useHandoffDebug((state) => state.session)
  const entry = useHandoffDebug((state) => state.entry)
  const startedAt = useHandoffDebug((state) => state.startedAt)
  // Re-renders on every change of the session.
  useHandoffDebug((state) => state.revision)
  const [pasted, setPasted] = useState('')
  const [selfTest, setSelfTest] = useState<SelfTestStep[] | null>(null)
  const [testing, setTesting] = useState(false)

  const snapshot = session?.debug() ?? null
  const parsed = pasted ? parseHandoffLink(pasted) : null

  const runSelfTest = async () => {
    setTesting(true)
    setSelfTest([])
    try {
      const passed = await runHandoffSelfTest((step) =>
        setSelfTest((steps) => [...(steps ?? []), step])
      )
      passed
        ? toast.success('Self-test passed')
        : toast.error('Self-test failed')
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <ToolSubheading
        title='Handoff'
        info='Set Up Another Device: the old phone opens a channel and shows a QR code; the new phone claims it with a sealed hello; both derive the same 6-digit code; the old phone sends the sealed account key; the new phone stores it and calls done. Polls every 1.5 s while a screen shows it. The log has request outcomes and server codes, never keys, secrets, or tokens.'
      />
      <ToolList>
        <ToolRow
          label='Session'
          value={
            snapshot
              ? `${snapshot.role === 'offer' ? 'old (offer)' : 'new (claim)'} · ${entry ?? '—'}`
              : 'none yet'
          }
        />
        {snapshot && (
          <>
            <ToolRow label='Step' value={snapshot.step} />
            <ToolRow
              label='Server status'
              value={snapshot.status ?? '—'}
              tone={snapshot.failure ? 'destructive' : 'default'}
            />
            {snapshot.failure && (
              <ToolRow
                label='Failure'
                tone='destructive'
                value={snapshot.failure}
              />
            )}
            <ToolRow
              label='channelId'
              info='Dev builds show it whole; others shorten it.'
              value={channelShown(snapshot.channelId)}
            />
            <ToolRow
              label='Started'
              value={startedAt ? clock(startedAt) : '—'}
            />
            <ToolRow
              label='Expires'
              value={
                snapshot.expiresAt
                  ? `${moment(snapshot.expiresAt).format('HH:mm:ss')} (${moment(snapshot.expiresAt).fromNow()})`
                  : '—'
              }
            />
            <ToolRow label='offerPub' value={shortId(snapshot.offerPub)} />
            <ToolRow label='claimPub' value={shortId(snapshot.claimPub)} />
            <ToolRow
              label='Code'
              value={snapshot.code ? formatHandoffCode(snapshot.code) : '—'}
            />
          </>
        )}
      </ToolList>
      {snapshot && snapshot.events.length > 0 && (
        <View style={{ paddingVertical: 6, gap: 2 }}>
          {snapshot.events.map((event, index) => (
            <Text
              key={index}
              selectable
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color:
                  event.outcome === 'ok'
                    ? theme.colors.textAlt
                    : theme.colors.error,
              }}
            >
              {`${clock(event.at)} ${event.op} → ${event.outcome}${event.httpStatus ? ` ${event.httpStatus}` : ''}${event.status ? ` [${event.status}]` : ''}${event.ms !== undefined ? ` ${event.ms}ms` : ''}`}
            </Text>
          ))}
        </View>
      )}
      <ToolList>
        {snapshot && (
          <>
            {__DEV__ &&
              session?.role === 'offer' &&
              session.state.step === 'waiting' && (
                <ToolRow
                  label='Copy QR link (dev)'
                  info='The link the QR code holds, secret included: paste it into the other phone’s Tools, or open it with `wwv link`. Dev builds only.'
                  onPress={() => {
                    const state = session.state
                    if (state.step !== 'waiting') return
                    void Clipboard.setStringAsync(state.link).then(() =>
                      toast.success('QR link copied')
                    )
                  }}
                />
              )}
            <ToolRow
              label='Copy session log'
              info='JSON of the rows and log above, for a bug report.'
              onPress={() =>
                void Clipboard.setStringAsync(dump(snapshot, entry)).then(() =>
                  toast.success('Session log copied')
                )
              }
            />
            <ToolRow
              label='Simulate expiry'
              info='Ends this session locally as expired, without a request, to check the screen. The server still keeps the channel until its own expiry.'
              onPress={() => session?.expire()}
            />
            <ToolRow
              label='Simulate cancel (server)'
              tone='destructive'
              info='Cancels the channel on the server and keeps this session running, so its next poll (or the other phone’s) sees `cancelled`.'
              onPress={() =>
                void (session?.role === 'offer'
                  ? session.cancelOnServerOnly()
                  : session?.cancel())
              }
            />
          </>
        )}
        <ToolRow
          label='Show a QR code'
          info='Opens Set Up Another Device (entry: tools).'
          onPress={() =>
            navigation.navigate('Set Up Another Device', { entry: 'tools' })
          }
        />
        <ToolRow
          label='Open the scanner'
          info='Opens Sign In with QR Code (entry: tools).'
          onPress={() =>
            navigation.navigate('Sign In With QR Code', { entry: 'tools' })
          }
        />
        <ToolRow
          label={testing ? 'Self-testing…' : 'Run self-test'}
          info='A whole handoff between two sessions in this app against the configured server, with this device’s account as the old phone: open, claim, status, compare codes, send, receive, done. Changes nothing on the device. Counts toward the 20 opens per account a day.'
          disabled={testing}
          onPress={() => void runSelfTest()}
        />
      </ToolList>
      {selfTest && selfTest.length > 0 && (
        <View style={{ paddingVertical: 6, gap: 2 }}>
          {selfTest.map((step, index) => (
            <Text
              key={index}
              selectable
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: step.ok ? theme.colors.textAlt : theme.colors.error,
              }}
            >
              {`${step.ok ? 'ok  ' : 'FAIL'} ${step.label} · ${step.detail} · ${step.ms}ms`}
            </Text>
          ))}
        </View>
      )}
      <View style={{ gap: 6, paddingVertical: 6 }}>
        <TextInput
          value={pasted}
          onChangeText={setPasted}
          placeholder='Paste a handoff link to parse'
          autoCapitalize='none'
          autoCorrect={false}
          style={{ minHeight: 36, borderColor: theme.colors.border }}
          testID='handoff-tools-link'
        />
        <ToolList>
          <ToolRow
            label='Parsed'
            value={
              !parsed
                ? '—'
                : parsed.ok
                  ? `ok · channel ${channelShown(parsed.offer.channelId)} · offerPub ${shortId(parsed.offer.offerPub)} · secret ${parsed.offer.secret.length} B`
                  : parsed.problem
            }
          />
          <ToolRow
            label='Sign in with this link'
            info='Opens Sign In with QR Code with the pasted link, as if the system camera opened it.'
            disabled={!parsed?.ok}
            onPress={() =>
              navigation.navigate('Sign In With QR Code', {
                entry: 'tools',
                link: pasted.trim(),
              })
            }
          />
        </ToolList>
      </View>
    </>
  )
}
