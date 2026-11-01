import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { Copy as CopyIcon, Share as ShareIcon } from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import ContextMenu from '@/components/ui/ContextMenu'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import i18n from '@/lib/locales'
import useFullBrightness from '@/hooks/useFullBrightness'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import BuddyRequestRow from '@/features/buddies/components/BuddyRequestRow'
import useInviteLinkActions from '@/features/buddies/hooks/useInviteLinkActions'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import {
  buddiesErrorMessage,
  isRetryableBuddiesError,
} from '@/features/buddies/lib/buddiesErrors'
import { BuddyInviteError } from '@/features/buddies/lib/engine'
import { isRelayConnectivityError } from '@/features/buddies/lib/relay'
import { startFallbackPoll } from '@/features/buddies/lib/autoSync'
import { MAX_BUDDIES, MAX_OPEN_INVITES } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { formatRelative } from '@/lib/dates'

const QR_SIZE = 240
const APP_ICON = require('@/assets/icon.png')

const POLL_INTERVAL_MS = 15 * 1000

let lastCodeInviteId: string | null = null

type CodeState =
  | { state: 'loading' }
  | { state: 'ready'; inviteId: string; link: string }
  | { state: 'full' }
  | { state: 'openInvites' }
  | { state: 'error'; message: string; retryable: boolean }

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
    if (!created) return codeError(null)
    lastCodeInviteId = created.inviteId
    return { state: 'ready', inviteId: created.inviteId, link }
  } catch (error) {
    if (error instanceof BuddyInviteError && error.reason === 'limit')
      return { state: 'full' }
    if (error instanceof BuddyInviteError && error.reason === 'openInvites')
      return { state: 'openInvites' }
    return codeError(error)
  }
}

function codeError(error: unknown): CodeState {
  return isRelayConnectivityError(error) || error === null
    ? { state: 'error', message: i18n.t('buddies_codeError'), retryable: true }
    : {
        state: 'error',
        message: buddiesErrorMessage(error),
        retryable: isRetryableBuddiesError(error),
      }
}

export default function BuddyCodePanel({
  inviteId,
  onClosed,
}: {
  inviteId?: string

  onClosed: () => void
}) {
  const theme = useTheme()

  const largeText = useAccessibilityTextSize()
  const [code, setCode] = useState<CodeState>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const outgoingInvites = useBuddies((state) => state.outgoingInvites)
  const shownInviteId = code.state === 'ready' ? code.inviteId : null
  const claim = useBuddies((state) =>
    state.incomingClaims.find((c) => c.inviteId === shownInviteId)
  )
  const invite = outgoingInvites.find((i) => i.inviteId === shownInviteId)
  const { copy, share, cancel } = useInviteLinkActions(shownInviteId)

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

  useEffect(() => {
    if (!shownInviteId || claim) return
    return startFallbackPoll(
      () => buddiesEngine.sync({ automatic: true }).then(() => true),
      POLL_INTERVAL_MS
    )
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
        <ActivityIndicator accessibilityLabel={i18n.t('buddies_codeLoading')} />
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
            : code.state === 'openInvites'
              ? i18n.t('buddies_openInvitesLimit', { max: MAX_OPEN_INVITES })
              : code.message}
        </Text>
        {code.state === 'error' && code.retryable && (
          <ActionButton onPress={retry}>
            {i18n.t('buddies_tryAgain')}
          </ActionButton>
        )}
      </Card>
    )
  }

  const linkButton = {
    flexShrink: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: theme.colors.accentTranslucent,
  }
  const linkButtonText = {
    flexShrink: 1,
    color: theme.colors.accent,
    fontFamily: theme.fonts.semiBold,
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
          <ContextMenu
            accessibilityLabel={i18n.t('buddies_codeTitle')}
            actions={[
              {
                id: 'copy_link',
                title: i18n.t('buddies_copyLink'),
                systemImage: 'doc.on.doc',
                onPress: copy,
              },
              {
                id: 'share_link',
                title: i18n.t('buddies_shareLinkEllipsis'),
                systemImage: 'square.and.arrow.up',
                onPress: share,
              },
            ]}
          >
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
                ecl='H'
                logo={APP_ICON}
                logoSize={QR_SIZE * 0.16}
                logoMargin={3}
                logoBorderRadius={8}
                logoBackgroundColor='#FFFFFF'
              />
            </View>
          </ContextMenu>
          <Text
            style={{
              textAlign: 'center',
              maxWidth: largeText ? undefined : 300,
            }}
          >
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
                time: formatRelative(invite.expiresAt),
              })}
            </Text>
          )}
          {}
          <XView
            style={{ gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}
          >
            <Button onPress={copy} style={linkButton}>
              <LucideIcon
                icon={CopyIcon}
                size={15}
                color={theme.colors.accent}
              />
              <Text style={linkButtonText}>{i18n.t('buddies_copyLink')}</Text>
            </Button>
            <Button onPress={share} style={linkButton}>
              <LucideIcon
                icon={ShareIcon}
                size={15}
                color={theme.colors.accent}
              />
              <Text style={linkButtonText}>{i18n.t('buddies_shareLink')}</Text>
            </Button>
          </XView>
          {invite && (
            <Button onPress={cancel} style={{ paddingVertical: 6 }}>
              <Text style={{ color: theme.colors.error }}>
                {i18n.t('buddies_cancelInvite')}
              </Text>
            </Button>
          )}
        </>
      )}
    </View>
  )
}
