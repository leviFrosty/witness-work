import { getRandomBytes } from 'expo-crypto'
import apis from '@/constants/apis'
import { accountKey } from '@/app/account/accountKey'
import { handoffHello } from '@/app/account/handoff'
import { toB64u } from '@/lib/bytes'
import { accountSessions, serverAccount } from '@/lib/serverAccount'
import { parseHandoffLink } from '@/lib/serverAccount/handoff'
import {
  createClaimSession,
  createOfferSession,
  type HandoffEvent,
} from '@/lib/serverAccount/handoffSession'
import { syncNow } from '@/lib/syncClock'

export type SelfTestStep = {
  label: string
  ok: boolean
  detail: string
  ms: number
}

export async function runHandoffSelfTest(
  onStep: (step: SelfTestStep) => void
): Promise<boolean> {
  const events: HandoffEvent[] = []
  const deps = {
    baseUrl: apis.accounts,
    now: syncNow,
    randomBytes: getRandomBytes,
    onEvent: (event: HandoffEvent) => events.push(event),
  }
  const lastOutcome = () => {
    const event = events.at(-1)
    return event ? `${event.op} → ${event.outcome}` : ''
  }
  const step = async (
    label: string,
    run: () => Promise<string | false>
  ): Promise<boolean> => {
    const started = Date.now()
    try {
      const result = await run()
      onStep({
        label,
        ok: result !== false,
        detail: result === false ? lastOutcome() || 'failed' : result,
        ms: Date.now() - started,
      })
      return result !== false
    } catch (error) {
      onStep({
        label,
        ok: false,
        detail: String(error),
        ms: Date.now() - started,
      })
      return false
    }
  }

  let key: Uint8Array | null = null
  let accountId: string | null = null
  if (
    !(await step('Account', async () => {
      key = await accountKey.getOrCreate()
      const account = await serverAccount.ensure(key)
      if (!account) return false
      accountId = account.accountId
      return `registered ${account.accountId.slice(0, 6)}…`
    }))
  )
    return false
  const old = createOfferSession(
    {
      accountKey: key!,
      accountId: accountId!,
      authorize: (run) =>
        accountSessions.withSession(run, { accountKey: key! }),
    },
    deps
  )
  let fresh: ReturnType<typeof createClaimSession> | null = null
  try {
    const passed =
      (await step('Open (old)', async () => {
        await old.open()
        return old.state.step === 'waiting' ? lastOutcome() : false
      })) &&
      (await step('Parse link', async () => {
        if (old.state.step !== 'waiting') return false
        const parsed = parseHandoffLink(old.state.link)
        if (!parsed.ok) return false
        fresh = createClaimSession(parsed.offer, handoffHello(), deps)
        return `${old.state.link.length} chars`
      })) &&
      (await step('Claim (new)', async () => {
        await fresh!.claim()
        return fresh!.state.step === 'waiting' ? lastOutcome() : false
      })) &&
      (await step('Status → claimed (old)', async () => {
        await old.poll()
        return old.state.step === 'confirm' ? lastOutcome() : false
      })) &&
      (await step('Codes match', async () => {
        if (old.state.step !== 'confirm') return false
        return old.state.code === fresh!.code
          ? `${old.state.code} · ${old.state.hello.deviceName}`
          : false
      })) &&
      (await step('Send (old)', async () => {
        await old.approve()
        return old.state.step === 'sent' ? lastOutcome() : false
      })) &&
      (await step('Receive (new)', async () => {
        await fresh!.poll()
        const state = fresh!.state
        if (state.step !== 'received') return false
        const same =
          toB64u(state.received.accountKey) === toB64u(key!) &&
          state.received.accountId === accountId
        return same ? 'key and account match' : false
      })) &&
      (await step('Done (new)', async () => {
        await fresh!.finish()
        const event = events.at(-1)
        return event?.op === 'handoff/done' && event.outcome === 'ok'
          ? lastOutcome()
          : false
      })) &&
      (await step('Status → done (old)', async () => {
        await old.poll()
        return old.state.step === 'done' ? lastOutcome() : false
      }))
    return passed
  } finally {
    const freshSession = fresh as ReturnType<typeof createClaimSession> | null
    if (old.state.step !== 'done') await old.cancelOnServerOnly()
    if (freshSession && freshSession.state.step !== 'done')
      await freshSession.cancel()
  }
}
