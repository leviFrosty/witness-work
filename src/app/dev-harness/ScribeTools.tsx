import { useState } from 'react'
import { View } from 'react-native'
import { MessageSquareText as ScribeIcon } from 'lucide-react-native'
import { toast } from '@/stores/toasts'
import Switch from '@/components/ui/Switch'
import confirmDestructive from '@/lib/confirmDestructive'
import JsonViewer from '@/features/contacts/components/JsonViewer'
import {
  ToolList,
  ToolRow,
  ToolSection,
  ToolSubheading,
} from '@/app/navigation/tools/ToolsUI'
import {
  refreshScribeStatus,
  useScribeAvailability,
  useScribeEnabled,
  useScribeOffered,
} from '@/features/scribe'
import { useScribeConversations } from '@/features/scribe/stores/conversations'
import { useScribeStatusStore } from '@/features/scribe/stores/status'
import { useScribeUsageStore } from '@/features/scribe/stores/usage'
import { useScribeLedger } from '@/features/scribe/stores/ledger'
import { DEFAULT_SCRIBE_LIMITS } from '@/features/scribe/lib/wire'
import {
  clearScribeLocalData,
  scribeContextSize,
  scribeHarness,
} from '@/app/dev-harness/scribe'
import { FAKE_SCRIPT_NAMES, fake } from '@/app/dev-harness/scribeFake'

const when = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleString() : '—'

export default function ScribeTools() {
  const offered = useScribeOffered()
  const enabled = useScribeEnabled()
  const availability = useScribeAvailability()
  const status = useScribeStatusStore((state) => state.status)
  const statusFailed = useScribeStatusStore((state) => state.failed)
  const fetchedAt = useScribeStatusStore((state) => state.fetchedAt)
  const gate = useScribeStatusStore((state) => state.gate)
  const devClient = useScribeStatusStore((state) => state.devClient)
  const usage = useScribeUsageStore((state) => state.snapshot)
  const usageFailed = useScribeUsageStore((state) => state.failed)
  const conversations = useScribeConversations((state) => state.conversations)
  const undoable = useScribeLedger((state) => Object.keys(state.records).length)
  const [context, setContext] = useState<ReturnType<
    typeof scribeContextSize
  > | null>(null)

  const limits = status?.limits ?? DEFAULT_SCRIBE_LIMITS
  const latest = Object.values(conversations).sort(
    (a, b) => b.updatedAt - a.updatedAt
  )[0]
  const availabilityText =
    availability.status === 'available'
      ? availability.limited
        ? 'limited'
        : 'available'
      : `${availability.status}${'reason' in availability ? ` (${availability.reason})` : ''}`

  return (
    <ToolSection title='Scribe AI' icon={ScribeIcon} summary={availabilityText}>
      <ToolSubheading
        title='Status'
        info='GET /scribe/v1/status (no auth), read on launch, after 5 minutes away and on reconnecting. A failed read is fail-open. The device gate comes from the session client and earlier calls; nothing here opens a session.'
      />
      <ToolList>
        <ToolRow label='Flag scribe-ai' value={String(offered)} />
        <ToolRow label='Enabled (flag and Settings)' value={String(enabled)} />
        <ToolRow label='Availability' value={availabilityText} />
        <ToolRow
          label='Server'
          value={
            status
              ? status.enabled
                ? 'enabled'
                : `disabled (${status.reason ?? 'disabled'})`
              : statusFailed
                ? 'read failed'
                : 'not read'
          }
        />
        <ToolRow label='Read at' value={when(fetchedAt)} />
        <ToolRow
          label='Protocol'
          value={status ? `${status.protocol.min}–${status.protocol.max}` : '—'}
        />
        <ToolRow label='Min app version' value={status?.minAppVersion ?? '—'} />
        <ToolRow
          label='Disabled tools'
          value={status?.disabledTools.join(', ') || 'none'}
        />
        <ToolRow
          label='Device gate'
          value={
            Object.entries(gate)
              .filter(([, on]) => on)
              .map(([key]) => key)
              .join(', ') || 'clear'
          }
        />
        <ToolRow
          label='Refresh status and usage'
          onPress={refreshScribeStatus}
        />
      </ToolList>

      <ToolSubheading title='Limits' />
      <ToolList>
        <ToolRow label='Max input tokens' value={`${limits.maxInputTokens}`} />
        <ToolRow
          label='Max steps per turn'
          value={`${limits.maxStepsPerTurn}`}
        />
        <ToolRow
          label='Max user text'
          value={`${limits.maxUserTextChars} chars`}
        />
        <ToolRow
          label='Max tool result'
          value={`${limits.maxToolResultBytes} B`}
        />
        <ToolRow
          label='Max tools'
          value={`${limits.maxTools} / ${limits.maxToolsBytes} B`}
        />
      </ToolList>

      <ToolSubheading
        title='Usage'
        info='The newest snapshot by asOf, from GET /scribe/v1/usage, every step’s meter and every page read. Units are developer-only.'
      />
      <ToolList>
        <ToolRow
          label='Plan'
          value={
            usage
              ? `${usage.plan}${usage.supporterCheckFailed ? ' (supporter check failed)' : ''}`
              : usageFailed
                ? 'read failed'
                : '—'
          }
        />
        {usage?.windows.flatMap((window) => [
          <ToolRow
            key={window.id}
            label={window.id}
            value={`${window.percentUsed}%${
              window.units
                ? ` · ${window.units.used}/${window.units.limit}`
                : ''
            }`}
          />,
          <ToolRow
            key={`${window.id}-resets`}
            label='Resets'
            value={when(window.resetsAt)}
          />,
        ])}
        <ToolRow
          label='Limited'
          value={
            usage
              ? usage.limited
                ? `until ${when(usage.resetsAt)}`
                : 'no'
              : '—'
          }
        />
        <ToolRow label='As of' value={when(usage?.asOf)} />
      </ToolList>

      <ToolSubheading
        title='Context and steps'
        info='What the next new conversation would pin: the context snapshot and the tool definitions, as JSON bytes. The last step is the newest conversation’s.'
      />
      <ToolList>
        <ToolRow
          label='Measure context snapshot'
          onPress={() => setContext(scribeContextSize())}
        />
        {context && (
          <>
            <ToolRow
              label='Context'
              value={`${context.contextBytes} B · ${context.contacts} contacts${context.contactsTruncated ? '+' : ''} · ${context.plans} plans`}
            />
            <ToolRow
              label='Tools'
              value={`${context.tools} · ${context.toolsBytes} B`}
            />
          </>
        )}
        <ToolRow
          label='Last step input'
          value={
            latest?.lastInputTokens != null
              ? `${latest.lastInputTokens} tokens (${Math.round((latest.lastInputTokens / limits.maxInputTokens) * 100)}%)`
              : '—'
          }
        />
        <ToolRow
          label='Conversations'
          value={`${Object.keys(conversations).length}`}
        />
        <ToolRow label='Undoable applies' value={`${undoable}`} />
      </ToolList>

      <ToolSubheading
        title='On-device fake'
        info='Answers status, usage, steps and page reads on this device. Queue a canned turn, then send any message from the conversation screen (or __WW_DEV__.scribe.send). Device gates are skipped while it is on.'
      />
      <ToolList>
        <ToolRow
          label='Answer from the fake'
          trailing={
            <Switch
              accessibilityLabel='Answer from the fake'
              value={devClient}
              onValueChange={(on) => void scribeHarness.enableFake(on)}
            />
          }
        />
        {devClient &&
          FAKE_SCRIPT_NAMES.map((name) => (
            <ToolRow
              key={name}
              label={`Queue “${name}”`}
              onPress={() => {
                scribeHarness.script(name)
                toast.info(`Queued ${name}`, {
                  message: `${fake.queue.length} steps waiting`,
                })
              }}
            />
          ))}
        {devClient && (
          <ToolRow
            label='Inject a proposal'
            info='Runs the planAndLog turn in a new conversation.'
            onPress={() => {
              scribeHarness.injectProposal()
              toast.info('Proposal requested')
            }}
          />
        )}
        <ToolRow
          label='Clear Scribe AI local data'
          tone='destructive'
          info='Conversations, undo records and the usage snapshot on this device. Records Scribe AI added stay.'
          onPress={() =>
            confirmDestructive({
              title: 'Clear Scribe AI local data',
              description: 'This cannot be undone.',
              onConfirm: () => {
                clearScribeLocalData()
                toast.success('Scribe AI data cleared')
              },
            })
          }
        />
      </ToolList>
      <View style={{ gap: 8, paddingTop: 8 }}>
        <JsonViewer label='Status' value={status} count={status ? 1 : 0} />
        <JsonViewer
          label='Usage snapshot'
          value={usage}
          count={usage ? 1 : 0}
        />
        <JsonViewer
          label='Newest conversation'
          value={latest ? scribeHarness.conversation(latest.id) : null}
          count={latest ? 1 : 0}
        />
      </View>
    </ToolSection>
  )
}
