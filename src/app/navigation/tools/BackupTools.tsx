import { useState } from 'react'
import { Alert, View } from 'react-native'
import moment from 'moment'
import { toast } from '@/stores/toasts'
import Text from '@/components/ui/MyText'
import Switch from '@/components/ui/Switch'
import useTheme from '@/contexts/theme'
import {
  backUpNow,
  deleteBackupSlot,
  refreshBackupSlots,
  resetBackupState,
} from '@/app/account/backup'
import { payloadCounts } from '@/app/account/backupData'
import {
  type BackupInspection,
  dryRunRestore,
  inspectBackups,
  offerRestore,
  simulateCorruptDownload,
} from '@/app/account/backupRestore'
import {
  MONO,
  ToolList,
  ToolRow,
  ToolSubheading,
} from '@/app/navigation/tools/ToolsUI'
import { BackupError } from '@/lib/serverAccount/backupScheduler'
import { HttpError } from '@/lib/http/request'
import { useBackupState } from '@/lib/serverAccount/backupStore'
import JsonViewer from '@/features/contacts/components/JsonViewer'

const shortId = (value: string | null | undefined) =>
  value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—'

/** Slot ids are shown in full only in dev builds. */
const slotShown = (id: string | null | undefined) =>
  id ? (__DEV__ ? id : shortId(id)) : '—'

const when = (at: number | null | undefined) =>
  at ? moment(at).format('YYYY-MM-DD HH:mm:ss') : '—'

const describe = (error: unknown) =>
  error instanceof BackupError
    ? error.code
    : error instanceof HttpError
      ? `${error.serverCode ?? error.kind}${error.status ? ` (${error.status})` : ''}`
      : String(error)

/** A downloaded slot as Tools shows it: counts by default, not the records. */
const summarize = (inspection: BackupInspection, raw: boolean) => ({
  accountId: slotShown(inspection.accountId),
  slots: inspection.slots.map((slot) => ({
    slotId: slotShown(slot.slotId),
    size: slot.size,
    uploadedAt: new Date(slot.uploadedAt).toISOString(),
    ...(slot.ok
      ? {
          ok: true,
          deviceName: slot.deviceName,
          platform: slot.platform,
          createdAt: new Date(slot.createdAt).toISOString(),
          payloadVersion: slot.payload.version,
          counts: payloadCounts(slot.payload),
          ...(raw ? { payload: slot.payload } : {}),
        }
      : { ok: false, problem: slot.problem }),
  })),
})

/**
 * Tools → Account → Backup (ADR 0026 §4): this install's slot and schedule, the
 * server's slot list, a log, and the real flows to upload, decrypt, dry-run a
 * restore, delete, and break things on purpose.
 */
export default function BackupTools() {
  const theme = useTheme()
  const state = useBackupState()
  const [busy, setBusy] = useState<string | null>(null)
  const [inspection, setInspection] = useState<BackupInspection | null>(null)
  const [raw, setRaw] = useState(false)
  const [dryRun, setDryRun] = useState<unknown>(null)
  const say = (title: string, message = '') => toast.info(title, { message })
  const { schedule } = state

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label)
    try {
      await action()
    } catch (error) {
      say(`${label} failed`, describe(error))
    } finally {
      setBusy(null)
    }
  }

  const uploadNow = () =>
    run('Upload now', async () => {
      const result = await backUpNow('tools')
      say(
        `Upload: ${result.outcome}`,
        result.outcome === 'failed'
          ? result.code
          : result.outcome === 'uploaded'
            ? `${result.size} bytes`
            : result.outcome === 'waiting'
              ? `until ${when(result.until)}`
              : ''
      )
    })

  const list = () =>
    run('List slots', async () => {
      const slots = await refreshBackupSlots()
      say('Listed', `${slots?.length ?? 0} slot(s)`)
    })

  const decrypt = (slotIds?: string[]) =>
    run('Decrypt', async () => {
      const result = await inspectBackups(slotIds)
      if (!result) throw new Error('No account key on this device')
      setInspection(result)
      setDryRun(null)
    })

  const runDryRun = () =>
    run('Dry run', async () => {
      const result = await inspectBackups()
      if (!result) throw new Error('No account key on this device')
      setInspection(result)
      setDryRun(dryRunRestore(result.slots))
    })

  const confirmDelete = (slotId: string) =>
    Alert.alert('Delete this slot?', slotShown(slotId), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void run('Delete slot', async () => {
            await deleteBackupSlot(slotId, 'tools')
            say('Deleted', shortId(slotId))
          }),
      },
    ])

  const confirmReset = () =>
    Alert.alert(
      'Reset backup state?',
      'Forgets this install’s slot id, schedule, restore offer and log, and turns backup off. The server keeps the old slot until it expires or is deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            resetBackupState()
            setInspection(null)
            setDryRun(null)
            say('Backup state reset')
          },
        },
      ]
    )

  return (
    <>
      <ToolSubheading
        title='Backup'
        info='The end-to-end encrypted backup: one slot per install at v1/<accountId>/<slotId>, sealed with HKDF(accountKey, "ww-account/v1/backup"). State lives in MMKV `server-account` → `backup`.'
      />
      <ToolList>
        <ToolRow label='Slot id' value={slotShown(state.slotId)} />
        <ToolRow label='Enabled' value={state.enabled ? 'yes' : 'no'} />
        <ToolRow
          label='Running'
          value={
            state.uploading ? 'uploading' : state.restoring ? 'restoring' : '—'
          }
        />
        <ToolRow
          label='Last upload'
          value={`${when(schedule.lastPutAt)} · ${schedule.lastSize ?? '—'} B`}
        />
        <ToolRow
          label='Last attempt'
          tone={schedule.lastResult === 'failed' ? 'destructive' : 'default'}
          value={`${when(schedule.lastAttemptAt)} · ${schedule.lastResult ?? '—'}${schedule.lastError ? ` (${schedule.lastError})` : ''}`}
        />
        <ToolRow
          label='Plaintext hash'
          info='SHA-256 of the plaintext without its timestamps, with the account and slot. An unchanged hash within a day skips the upload.'
          value={shortId(schedule.lastHash)}
        />
        <ToolRow label='Pending' value={schedule.pending ? 'yes' : 'no'} />
        <ToolRow
          label='Failures in a row'
          value={`${schedule.failures}${schedule.retryAt ? ` · retry ${when(schedule.retryAt)}` : ''}`}
        />
        <ToolRow
          label='Next attempt'
          value={state.enabled ? when(schedule.nextAttemptAt) : '—'}
        />
        <ToolRow
          label='Restore offered for'
          value={shortId(state.restoreOfferedFor)}
        />
      </ToolList>
      <ToolList>
        <ToolRow
          label={busy === 'Upload now' ? 'Uploading…' : 'Upload now'}
          info='Skips the debounce and backoff; still waits out the server’s one put a minute.'
          disabled={!state.enabled || busy !== null}
          onPress={uploadNow}
        />
        <ToolRow
          label={busy === 'List slots' ? 'Listing…' : 'List server slots'}
          disabled={busy !== null}
          onPress={list}
        />
        <ToolRow
          label='Decrypt this slot'
          disabled={!state.slotId || busy !== null}
          onPress={() => decrypt(state.slotId ? [state.slotId] : [])}
        />
        <ToolRow
          label='Decrypt every slot'
          disabled={busy !== null}
          onPress={() => decrypt()}
        />
        <ToolRow
          label={busy === 'Dry run' ? 'Running…' : 'Restore dry run'}
          info='Downloads every slot and shows what Replace would leave and what Combine would change, as counts. Writes nothing.'
          disabled={busy !== null}
          onPress={runDryRun}
        />
        <ToolRow
          label='Offer restore'
          info='The real restore prompt, as Settings → Restore from Backup shows it.'
          disabled={busy !== null}
          onPress={() =>
            void offerRestore('tools', { quietWhenNone: false }).then(
              (result) => say(`Restore: ${result.outcome}`)
            )
          }
        />
        <ToolRow
          label='Simulate corrupt download'
          info='Flips the last byte of the next downloaded slot, so it fails to decrypt and is skipped.'
          onPress={() => {
            simulateCorruptDownload()
            say('The next download is corrupt')
          }}
        />
        <ToolRow
          label='Reset backup state'
          tone='destructive'
          onPress={confirmReset}
        />
      </ToolList>

      <ToolSubheading title='Server slots' />
      <ToolList>
        {(state.slots ?? []).map((slot) => (
          <ToolRow
            key={slot.slotId}
            label={`Delete ${slot.slotId === state.slotId ? 'this' : shortId(slot.slotId)}`}
            tone='destructive'
            value={`${slot.size} B · ${when(slot.uploadedAt)}`}
            disabled={busy !== null}
            onPress={() => confirmDelete(slot.slotId)}
          />
        ))}
      </ToolList>
      <View style={{ paddingTop: 8, gap: 8 }}>
        <JsonViewer
          label='Server slots (raw)'
          value={{
            listedAt: state.slotsListedAt
              ? new Date(state.slotsListedAt).toISOString()
              : null,
            accountId: slotShown(state.slotsAccountId),
            slots: state.slots,
          }}
        />
        {inspection && (
          <>
            <ToolRow
              label='Show raw payloads'
              trailing={
                <Switch
                  accessibilityLabel='Show raw payloads'
                  value={raw}
                  onValueChange={setRaw}
                />
              }
            />
            <JsonViewer
              label='Decrypted slots'
              value={summarize(inspection, raw)}
            />
          </>
        )}
        {dryRun !== null && (
          <JsonViewer label='Restore dry run' value={dryRun} />
        )}
      </View>

      <ToolSubheading title='Log' />
      <View style={{ gap: 2, paddingVertical: 4 }}>
        {state.log.length === 0 && (
          <Text style={{ color: theme.colors.textAlt }}>—</Text>
        )}
        {state.log.slice(0, 30).map((entry, i) => (
          <Text
            key={`${entry.at}-${i}`}
            selectable
            style={{
              fontFamily: MONO,
              fontSize: theme.fontSize('xs'),
              color:
                entry.level === 'warn' ? theme.colors.error : theme.colors.text,
            }}
          >
            {moment(entry.at).format('MM-DD HH:mm:ss')} {entry.message}
          </Text>
        ))}
      </View>
    </>
  )
}
