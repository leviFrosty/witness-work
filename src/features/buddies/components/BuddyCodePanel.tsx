import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, View } from 'react-native'
import * as Brightness from 'expo-brightness'
import QRCode from 'react-native-qrcode-svg'
import moment from 'moment'
import ActionButton from '@/components/ui/ActionButton'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import BuddyRequestRow from '@/features/buddies/components/BuddyRequestRow'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { BuddyInviteError } from '@/features/buddies/lib/engine'
import { MAX_BUDDIES } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

const QR_SIZE = 240
const APP_ICON = require('@/assets/icon.png')
/** In person, the claim should show up while the code is still on screen. */
const POLL_INTERVAL_MS = 3000

/** The invite the last code showed, reused until someone uses it. */
let lastCodeInviteId: string | null = null

type CodeState =
  | { state: 'loading' }
  | { state: 'ready'; inviteId: string; link: string }
  | { state: 'full' }
  | { state: 'error' }

/**
 * Full brightness while the code is on screen; the User's level comes back when
 * it closes or the app leaves the foreground.
 */
function useFullBrightness() {
  useEffect(() => {
    let previous: number | null = null
    const raise = async () => {
      previous ??= await Brightness.getBrightnessAsync()
      await Brightness.setBrightnessAsync(1)
    }
    const restore = async () => {
      if (previous === null) return
      const level = previous
      previous = null
      await Brightness.setBrightnessAsync(level)
    }
    const log = (error: unknown) => logger.warn('[buddies] brightness', error)
    void raise().catch(log)
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void raise().catch(log)
      else void restore().catch(log)
    })
    return () => {
      subscription.remove()
      void restore().catch(log)
    }
  }, [])
}

/** Reuses the invite passed in or the last code shown, else creates one. */
async function resolveCodeInvite(inviteId?: string): Promise<CodeState> {
  const reusable = [inviteId, lastCodeInviteId].find(
    (id) =>
      id && useBuddies.getState().outgoingInvites.some((i) => i.inviteId === id)
  )
  const reusedLink = reusable ? buddiesEngine.inviteLinkFor(reusable) : null
  if (reusable && reusedLink)
    return { state: 'ready', inviteId: reusable, link: reusedLink }
  try {
    const link = await buddiesEngine.createInvite()
    const created = useBuddies.getState().outgoingInvites.at(-1)
    if (!created) return { state: 'error' }
    lastCodeInviteId = created.inviteId
    return { state: 'ready', inviteId: created.inviteId, link }
  } catch (error) {
    return error instanceof BuddyInviteError && error.reason === 'limit'
      ? { state: 'full' }
      : { state: 'error' }
  }
}

/** A single-use invite as a QR code, confirmed on the spot once scanned. */
export default function BuddyCodePanel({
  inviteId,
  onClosed,
}: {
  inviteId?: string
  /** The shown invite was confirmed or cancelled; nothing left to show. */
  onClosed: () => void
}) {
  const theme = useTheme()
  const [code, setCode] = useState<CodeState>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const outgoingInvites = useBuddies((state) => state.outgoingInvites)
  const shownInviteId = code.state === 'ready' ? code.inviteId : null
  const claim = useBuddies((state) =>
    state.incomingClaims.find((c) => c.inviteId === shownInviteId)
  )
  const invite = outgoingInvites.find((i) => i.inviteId === shownInviteId)

  useFullBrightness()

  useEffect(() => {
    let cancelled = false
    void resolveCodeInvite(inviteId).then((next) => {
      if (!cancelled) setCode(next)
    })
    return () => {
      cancelled = true
    }
  }, [inviteId, attempt])

  const retry = () => {
    setCode({ state: 'loading' })
    setAttempt((count) => count + 1)
  }

  // Poll while the code waits to be scanned, so the request appears in place.
  useEffect(() => {
    if (!shownInviteId || claim) return
    const timer = setInterval(() => {
      void buddiesEngine.sync().catch(() => {})
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [shownInviteId, claim])

  const closed = code.state === 'ready' && !invite && !claim
  const closeHandled = useRef(false)
  useEffect(() => {
    if (!closed || closeHandled.current) return
    closeHandled.current = true
    onClosed()
  }, [closed, onClosed])

  if (code.state === 'loading') {
    return (
      <View style={{ height: QR_SIZE, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    )
  }

  if (closed) return null

  if (code.state !== 'ready') {
    return (
      <Card style={{ gap: 12 }}>
        <Text>
          {code.state === 'full'
            ? i18n.t('buddies_codeFull', { max: MAX_BUDDIES })
            : i18n.t('buddies_codeError')}
        </Text>
        {code.state === 'error' && (
          <ActionButton onPress={retry}>
            {i18n.t('buddies_tryAgain')}
          </ActionButton>
        )}
      </Card>
    )
  }

  return (
    <View style={{ gap: 20, alignItems: 'center' }}>
      {claim ? (
        <View style={{ alignSelf: 'stretch' }}>
          <BuddiesSection title={i18n.t('buddies_requestsSection')}>
            <BuddyRequestRow claim={claim} last />
          </BuddiesSection>
        </View>
      ) : (
        <>
          <View
            style={{
              padding: 16,
              borderRadius: theme.numbers.borderRadiusLg,
              backgroundColor: '#FFFFFF',
            }}
          >
            <QRCode
              value={code.link}
              size={QR_SIZE}
              color='#000000'
              backgroundColor='#FFFFFF'
              // High error correction so the covered center still scans.
              ecl='H'
              logo={APP_ICON}
              logoSize={QR_SIZE * 0.16}
              logoMargin={3}
              logoBorderRadius={8}
              logoBackgroundColor='#FFFFFF'
            />
          </View>
          <Text style={{ textAlign: 'center', maxWidth: 300 }}>
            {i18n.t('buddies_codeHint')}
          </Text>
          {invite && (
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {i18n.t('buddies_codeExpires', {
                time: moment(invite.expiresAt).fromNow(),
              })}
            </Text>
          )}
        </>
      )}
    </View>
  )
}
