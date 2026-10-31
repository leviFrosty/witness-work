import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import {
  CircleAlert as CircleAlertIcon,
  UserRoundKey as UserRoundKeyIcon,
  WifiOff as WifiOffIcon,
} from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Sheet from '@/components/ui/Sheet'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import { logger } from '@/lib/logger'
import type {
  SensitiveAction,
  StepUpFailure,
  StepUpReady,
  StepUpResult,
} from '@/lib/serverAccount/stepUp'
import {
  type ContinueAnswer,
  finishContinue,
  finishStepUp,
  pageClock,
  useStepUpPrompt,
  webStepUp,
} from '@/lib/serverAccount/stepUpPrompt'
import { startSignInAgain } from '@/app/web-sign-in/signInAgain'

type SheetView =
  | { kind: 'preparing' }
  | { kind: 'ready'; ready: StepUpReady; confirming: boolean }
  | { kind: 'offline' }
  | { kind: 'noPasskey' }
  | { kind: 'failed'; reason: StepUpFailure }
  /** The second tap, before a passkey's create. */
  | { kind: 'continue' }
  /**
   * The passkey prompt closed without an answer. A browser says the same for a
   * cancel as for none of the account's passkeys being here, so the sheet stays
   * and offers both ways on.
   */
  | { kind: 'stopped' }

const REASONS: Record<SensitiveAction, TranslationKey> = {
  recovery_key: 'stepUp_reasonRecoveryKey',
  add_passkey: 'stepUp_reasonAddPasskey',
  remove_passkey: 'stepUp_reasonRemovePasskey',
  delete_data: 'stepUp_reasonDeleteData',
  app_lock: 'stepUp_reasonAppLock',
  set_up_device: 'stepUp_reasonOther',
  approve_device: 'stepUp_reasonOther',
  change_account_key: 'stepUp_reasonChangeAccountKey',
}

const FAILURES: Record<StepUpFailure, TranslationKey> = {
  refused: 'stepUp_failedRefused',
  no_credentials: 'stepUp_failedNoCredentials',
  not_supported: 'stepUp_failedNotSupported',
  timeout: 'passkeys_failedTimeout',
  rate_limited: 'passkeys_failedRateLimited',
  update_required: 'passkeys_failed',
  unavailable: 'passkeys_failed',
  failed: 'passkeys_failed',
}

/**
 * Failures signing in again gets past: none of the account's passkeys here, one
 * the server doesn't take (another account's), or a browser that can't use
 * passkeys at all.
 */
const SIGN_IN_AGAIN: readonly StepUpFailure[] = [
  'no_credentials',
  'refused',
  'not_supported',
]

/** What closing the sheet in this state answers. */
function closedAs(view: SheetView): StepUpResult {
  switch (view.kind) {
    case 'offline':
    case 'noPasskey':
      return { status: view.kind }
    case 'failed':
      return { status: 'failed', reason: view.reason }
    default:
      return { status: 'cancelled' }
  }
}

/**
 * Asks for the challenge; still inside the server's window, the request ends at
 * once (`onSession`).
 */
async function prepare(
  id: number,
  action: SensitiveAction,
  setView: (view: SheetView) => void,
  onSession: (result: StepUpResult) => void
) {
  setView({ kind: 'preparing' })
  const prepared = await webStepUp()
    .prepare(action)
    .catch((error: unknown) => {
      logger.warn('[step-up] prepare threw', error)
      return { status: 'failed', reason: 'failed' } as const
    })
  if (useStepUpPrompt.getState().request?.id !== id) return
  switch (prepared.status) {
    case 'session':
      onSession({ status: 'confirmed', via: 'session', until: prepared.until })
      return
    case 'ready':
      setView({ kind: 'ready', ready: prepared, confirming: false })
      return
    case 'failed':
      setView({ kind: 'failed', reason: prepared.reason })
      return
    default:
      setView({ kind: prepared.status })
  }
}

/**
 * The web's check before a sensitive action (`requestStepUp`): it asks for the
 * step-up's challenge as it opens, so Continue with Passkey runs the passkey
 * prompt straight from the tap, and asks for a new one before it's too old to
 * send. Offline it says so and carries on once the browser is back online. An
 * account that can't step up here (no passkey, or none of its passkeys here) is
 * offered Sign In Again. Closing it cancels.
 *
 * It also asks for the second tap before a passkey's create
 * (`requestContinue`), whose Continue answers straight from the tap so the
 * create runs with its user activation. Web only.
 */
export default function StepUpSheet() {
  const theme = useTheme()
  const request = useStepUpPrompt((state) => state.request)
  const [view, setView] = useState<SheetView>({ kind: 'preparing' })
  const [open, setOpen] = useState(false)
  // How a step-up ends, answered once the sheet has closed: a sheet the action
  // opens next mustn't land on this one. Then Sign In Again, when chosen.
  const ending = useRef<{
    id: number
    result: StepUpResult
    signInAgain?: SensitiveAction
  } | null>(null)

  const end = (result: StepUpResult, signInAgain?: SensitiveAction) => {
    if (request?.kind !== 'stepUp' || ending.current) return
    ending.current = { id: request.id, result, signInAgain }
    setOpen(false)
  }

  const answerContinue = (answer: ContinueAnswer) => {
    if (request?.kind !== 'continue') return
    finishContinue(request.id, answer)
    setOpen(false)
  }

  const run = (id: number, action: SensitiveAction) =>
    void prepare(id, action, setView, (result) => {
      ending.current = { id, result }
      setOpen(false)
    })

  useEffect(() => {
    if (!request) return
    ending.current = null
    setOpen(true)
    if (request.kind === 'continue') setView({ kind: 'continue' })
    else run(request.id, request.action)
  }, [request])

  // Offline, the action waits: back online, it carries on by itself.
  useEffect(() => {
    if (request?.kind !== 'stepUp' || view.kind !== 'offline') return
    const online = () => run(request.id, request.action)
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [request, view.kind])

  // A challenge left too long would waste the passkey prompt: ask again first.
  const staleAt = view.kind === 'ready' ? view.ready.staleAt : null
  useEffect(() => {
    if (request?.kind !== 'stepUp' || staleAt === null) return
    const timer = setTimeout(
      () => run(request.id, request.action),
      Math.max(0, staleAt - pageClock())
    )
    return () => clearTimeout(timer)
  }, [request, staleAt])

  // The second tap waits only as long as the step-up counts.
  useEffect(() => {
    if (request?.kind !== 'continue') return
    const { id, until } = request
    const timer = setTimeout(
      () => {
        finishContinue(id, 'expired')
        setOpen(false)
      },
      Math.max(0, until - pageClock())
    )
    return () => clearTimeout(timer)
  }, [request])

  const confirm = async () => {
    const current = view
    if (request?.kind !== 'stepUp' || current.kind !== 'ready') return
    if (current.confirming) return
    // A timer that slept with the tab may not have asked for a new one yet.
    if (webStepUp().isStale(current.ready)) {
      run(request.id, request.action)
      return
    }
    setView({ ...current, confirming: true })
    const result = await webStepUp()
      .complete(current.ready)
      .catch((error: unknown) => {
        logger.warn('[step-up] complete threw', error)
        return { status: 'failed', reason: 'failed' } as const
      })
    if (useStepUpPrompt.getState().request?.id !== request.id) return
    if (result.status === 'offline') setView({ kind: 'offline' })
    else if (result.status === 'cancelled') setView({ kind: 'stopped' })
    else if (result.status === 'failed')
      setView({ kind: 'failed', reason: result.reason })
    // A used challenge doesn't work twice: Try Again asks for a new one.
    else end(result)
  }

  const action = request?.action ?? 'recovery_key'
  // The action stops quietly; the sign-in screen says what comes next.
  const signInAgain = () => end({ status: 'cancelled' }, action)
  const offersSignInAgain =
    view.kind === 'stopped' ||
    (view.kind === 'failed' && SIGN_IN_AGAIN.includes(view.reason))

  const message =
    view.kind === 'offline'
      ? i18n.t('stepUp_offline')
      : view.kind === 'noPasskey'
        ? i18n.t('stepUp_noPasskey')
        : view.kind === 'failed'
          ? i18n.t(FAILURES[view.reason])
          : view.kind === 'continue'
            ? i18n.t('stepUp_continueToCreate')
            : view.kind === 'stopped'
              ? i18n.t('stepUp_stopped')
              : i18n.t(REASONS[action])

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) return
        if (view.kind === 'continue') answerContinue('cancelled')
        else end(closedAs(view))
      }}
      onClosed={() => {
        const ended = ending.current
        if (!ended) return
        finishStepUp(ended.id, ended.result)
        if (ended.signInAgain) startSignInAgain(ended.signInAgain)
      }}
      dismissible={!(view.kind === 'ready' && view.confirming)}
      backgroundColor={theme.colors.card}
      accessibilityLabel={i18n.t('stepUp_title')}
      testID='step-up-sheet'
    >
      <View style={{ padding: 20, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <LucideIcon
            icon={
              view.kind === 'offline'
                ? WifiOffIcon
                : view.kind === 'failed' || view.kind === 'stopped'
                  ? CircleAlertIcon
                  : UserRoundKeyIcon
            }
            size={22}
            color={
              view.kind === 'failed' || view.kind === 'stopped'
                ? theme.colors.error
                : theme.colors.accent
            }
          />
          <Text
            accessibilityRole='header'
            style={{
              flex: 1,
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.bold,
            }}
          >
            {i18n.t(
              view.kind === 'noPasskey'
                ? 'stepUp_noPasskeyTitle'
                : view.kind === 'continue'
                  ? 'passkeys_add'
                  : 'stepUp_title'
            )}
          </Text>
        </View>
        <Text
          accessibilityLiveRegion='polite'
          testID={`step-up-${view.kind}`}
          style={{ color: theme.colors.textAlt }}
        >
          {message}
        </Text>
        {view.kind === 'preparing' || view.kind === 'offline' ? (
          <ActivityIndicator
            color={theme.colors.textAlt}
            style={{ minHeight: 48 }}
          />
        ) : view.kind === 'ready' ? (
          <ActionButton
            onPress={() => void confirm()}
            loading={view.confirming}
            testID='step-up-continue'
          >
            {i18n.t('stepUp_continue')}
          </ActionButton>
        ) : view.kind === 'continue' ? (
          <ActionButton
            onPress={() => answerContinue('continue')}
            testID='step-up-continue-create'
          >
            {i18n.t('continue')}
          </ActionButton>
        ) : view.kind === 'noPasskey' ? (
          <ActionButton onPress={signInAgain} testID='step-up-sign-in-again'>
            {i18n.t('stepUp_signInAgain')}
          </ActionButton>
        ) : (
          <View style={{ gap: 12 }}>
            <ActionButton
              onPress={() => request && run(request.id, request.action)}
              testID='step-up-try-again'
            >
              {i18n.t('handoff_tryAgain')}
            </ActionButton>
            {offersSignInAgain && (
              <Button
                onPress={signInAgain}
                style={{
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                testID='step-up-sign-in-again'
              >
                <Text
                  style={{
                    color: theme.colors.accent,
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('stepUp_signInAgain')}
                </Text>
              </Button>
            )}
          </View>
        )}
      </View>
    </Sheet>
  )
}
