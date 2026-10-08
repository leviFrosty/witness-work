import { useState } from 'react'
import { Platform, View } from 'react-native'
import { UsersRound as UsersRoundIcon } from 'lucide-react-native'
import moment from 'moment'
import { useToastController } from '@tamagui/toast'
import * as BuddiesKeychain from '../../../../modules/buddies-keychain'
import Switch from '@/components/ui/Switch'
import apis from '@/constants/apis'
import useNow from '@/hooks/useNow'
import JsonViewer from '@/features/contacts/components/JsonViewer'
import useBuddiesAvailability from '@/features/buddies/hooks/useBuddiesAvailability'
import { buddiesFailureReason } from '@/features/buddies/lib/buddiesErrors'
import {
  buddiesEngine,
  checkBuddiesRelay,
} from '@/features/buddies/lib/buddiesService'
import type { LiveDiagnostics } from '@/features/buddies/lib/liveDiagnostics'
import { registerBuddiesPush } from '@/features/buddies/lib/pushRegistration'
import type { RelayCheckStep } from '@/features/buddies/lib/relayCheck'
import { useBuddiesDiagnostics } from '@/features/buddies/stores/buddiesDiagnostics'
import { useBuddiesSession } from '@/features/buddies/stores/buddiesSession'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import {
  ToolList,
  ToolRow,
  ToolSection,
  ToolSubheading,
} from '@/app/navigation/tools/ToolsUI'

const shortId = (value: string | null) =>
  value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—'

const clock = (at: number | null | undefined) =>
  at ? moment(at).format('HH:mm:ss') : '—'

const ago = (at: number | null, now: number) =>
  at ? `${Math.max(0, Math.round((now - at) / 1000))}s ago` : '—'

const stepLabel: Record<RelayCheckStep['name'], string> = {
  health: 'Worker /health',
  inbox: 'Signed inbox read',
  liveHello: 'Live socket hello',
  livePing: 'Live ping → pong',
}

/** The live log, newest first, with readable times. */
const readableLog = (live: LiveDiagnostics) =>
  live.log
    .slice()
    .reverse()
    .map(({ at, event }) => ({
      t: moment(at).format('HH:mm:ss.SSS'),
      ...event,
    }))

/**
 * Buddies tools: visibility and onboarding switches, the live connection's
 * state with controls, and a relay check for when updates don't arrive. The
 * debug dump holds no names or content and only shortened ids.
 */
export default function BuddiesTools() {
  const toast = useToastController()
  const { now } = useNow()
  const devOverride = useBuddies((state) => state.devOverride)
  const inboxId = useBuddies((state) => state.registeredInboxId)
  const syncSeq = useBuddies((state) => state.syncSeq)
  const lastSyncAt = useBuddies((state) => state.lastSyncAt)
  const pushRegisteredAt = useBuddies((state) => state.pushRegisteredAt)
  const deviceId = useBuddies((state) => state.deviceId)
  const notificationsEnabled = useBuddies((state) => state.notificationsEnabled)
  const flagLastKnown = useBuddies((state) => state.flagLastKnown)
  const buddyStatuses = useBuddies((state) =>
    state.buddies.map((buddy) => buddy.status).join(',')
  )
  const availability = useBuddiesAvailability()
  const syncing = useBuddiesSession((state) => state.syncing)
  const failure = useBuddiesSession((state) => state.failure)
  const relayDisabled = useBuddiesSession((state) => state.relayDisabled)
  const live = useBuddiesDiagnostics((state) => state.live)
  const controls = useBuddiesDiagnostics((state) => state.controls)
  const relayCheck = useBuddiesDiagnostics((state) => state.relayCheck)
  const [lastManualSync, setLastManualSync] = useState<{
    at: number
    ms: number
    result: string
  } | null>(null)
  const started = inboxId !== null

  const say = (title: string, message = '') =>
    toast.show(title, { message, native: true })

  const syncNow = async () => {
    const startedAt = Date.now()
    try {
      await buddiesEngine.sync()
      const ms = Date.now() - startedAt
      setLastManualSync({ at: startedAt, ms, result: 'ok' })
      say(`Synced in ${ms} ms`)
    } catch (error) {
      const result = buddiesFailureReason(error)
      setLastManualSync({ at: startedAt, ms: Date.now() - startedAt, result })
      say('Sync failed', result)
    }
  }

  const reRegisterPush = async () => {
    // Forget the last registration so it's sent even when unchanged.
    useBuddies.setState({ pushRegistrationKey: null })
    try {
      await registerBuddiesPush()
      const registered =
        useBuddies.getState().pushRegisteredAt > pushRegisteredAt
      say(
        registered ? 'Push registered' : 'Push not registered',
        registered ? '' : 'Needs notification permission'
      )
    } catch (error) {
      say('Push registration failed', buddiesFailureReason(error))
    }
  }

  const runCheck = async () => {
    const report = await checkBuddiesRelay()
    if (!report) return
    const failed = report.steps.find((step) => !step.ok && !step.skipped)
    say(
      report.ok ? 'Relay check passed' : 'Relay check failed',
      failed ? `${stepLabel[failed.name]}: ${failed.detail}` : ''
    )
  }

  const debugDump = {
    at: new Date(now).toISOString(),
    relay: apis.buddies,
    availability,
    flagLastKnown,
    inbox: shortId(inboxId),
    syncSeq,
    lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : null,
    buddies: buddyStatuses ? buddyStatuses.split(',') : [],
    session: { syncing, failure, relayDisabled },
    lastManualSync,
    push: {
      service: Platform.OS === 'android' ? 'fcm' : 'apns',
      notificationsEnabled,
      registeredAt: pushRegisteredAt
        ? new Date(pushRegisteredAt).toISOString()
        : null,
      device: shortId(deviceId),
    },
    // Android: where Block Store keeps the root seed (iOS: iCloud Keychain).
    seedBackup: BuddiesKeychain.rootSeedBackup(),
    live: { ...live, log: readableLog(live) },
    relayCheck: relayCheck.report,
  }

  return (
    <ToolSection
      title='Buddies'
      icon={UsersRoundIcon}
      summary={started ? `live ${live.status}` : 'not started'}
    >
      <ToolList>
        {__DEV__ && (
          <ToolRow
            label='Show without the remote flag'
            trailing={
              <Switch
                value={devOverride}
                onValueChange={(value) => {
                  useBuddies.setState({ devOverride: value })
                }}
              />
            }
          />
        )}
        <ToolRow
          label='Reset Buddies onboarding'
          onPress={() => {
            useBuddies.setState({ onboardingComplete: false })
            say('Buddies onboarding reset')
          }}
        />
        <ToolRow label='Availability' value={availability} />
      </ToolList>

      <ToolSubheading
        title='Live connection'
        info='While the app is open, Buddies keeps a WebSocket to the relay (inbox/live). The relay sends hello with the inbox seq on connect and changed after every write; the app syncs on each. A ping every 25 s expects a pong within 10 s. Starts once Buddies has an inbox; stops in the background.'
      />
      <ToolList>
        <ToolRow
          label='Status'
          value={`${live.status} · ${ago(live.since, now)}`}
        />
        <ToolRow
          label='Hello / changed seq'
          value={`${live.lastHelloSeq ?? '—'} / ${live.lastChangedSeq ?? '—'}`}
        />
        <ToolRow
          label='Ping round trip'
          value={live.lastPongRttMs === null ? '—' : `${live.lastPongRttMs} ms`}
        />
        <ToolRow
          label='Last close'
          value={
            live.lastClose
              ? `${live.lastClose.code ?? '?'} ${live.lastClose.reason ?? ''} · ${clock(live.lastClose.at)}`
              : '—'
          }
        />
        <ToolRow
          label='Counts'
          info='Connects / opens / changed signals / syncs the socket asked for / closes / failed opens / pong timeouts, since launch.'
          value={`${live.counts.connects}/${live.counts.opens}/${live.counts.changes}/${live.counts.syncs}/${live.counts.closes}/${live.counts.failures}/${live.counts.pongTimeouts}`}
        />
        <ToolRow
          label='Ping now'
          disabled={!controls || live.status !== 'open'}
          onPress={() => controls?.ping()}
        />
        <ToolRow
          label='Reconnect now'
          disabled={!controls}
          onPress={() => controls?.reconnect()}
        />
      </ToolList>
      <View style={{ paddingTop: 8 }}>
        <JsonViewer
          label='Live event log'
          value={readableLog(live)}
          count={live.log.length}
        />
      </View>

      <ToolSubheading
        title='Relay'
        info='Run relay check tests each hop: the Worker’s /health, a signed read of this inbox from its cursor (applies nothing), and a separate live socket’s hello and ping. The running connection is untouched. Copy the debug dump into a bug report; it has no names or content and only shortened ids.'
      />
      <ToolList>
        <ToolRow label='Relay' value={apis.buddies} />
        <ToolRow label='Inbox' value={shortId(inboxId)} />
        <ToolRow
          label='Synced seq · last sync'
          value={`${syncSeq} · ${clock(lastSyncAt)}`}
        />
        <ToolRow
          label='Sync status'
          value={
            syncing > 0
              ? 'syncing'
              : relayDisabled
                ? 'relay disabled'
                : failure
                  ? `${failure.reason} · ${clock(failure.at)}`
                  : 'ok'
          }
        />
        <ToolRow
          label='Push registered'
          value={`${clock(pushRegisteredAt)} · ${shortId(deviceId)}`}
        />
        {Platform.OS === 'android' && (
          <ToolRow
            label='Seed backup'
            value={BuddiesKeychain.rootSeedBackup() ?? '—'}
          />
        )}
        <ToolRow
          label={relayCheck.running ? 'Checking…' : 'Run relay check'}
          disabled={!started || relayCheck.running}
          onPress={() => void runCheck()}
        />
        {relayCheck.report?.steps.map((step) => (
          <ToolRow
            key={step.name}
            label={stepLabel[step.name]}
            tone={step.ok || step.skipped ? 'default' : 'destructive'}
            value={`${step.ok ? '✓' : step.skipped ? '–' : '✗'} ${step.skipped ? '' : `${step.ms} ms · `}${step.detail}`}
          />
        ))}
        <ToolRow
          label='Sync now'
          disabled={!started}
          onPress={() => void syncNow()}
        />
        <ToolRow
          label='Re-register push'
          disabled={!started}
          onPress={() => void reRegisterPush()}
        />
      </ToolList>
      <View style={{ paddingTop: 8 }}>
        <JsonViewer label='Debug dump' value={debugDump} />
      </View>
    </ToolSection>
  )
}
