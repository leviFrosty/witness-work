import { X as XIcon } from 'lucide-react-native'
import { useRef } from 'react'
import { View } from 'react-native'
import Spinner from '@/components/ui/Spinner'
import Sheet from '@/components/ui/Sheet'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import IconButton from '@/components/ui/IconButton'
import Button from '@/components/ui/Button'
import InlineNotice from '@/components/ui/InlineNotice'
import InfoPopover from '@/components/ui/InfoPopover'
import XView from '@/components/ui/layout/XView'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import i18n from '@/lib/locales'
import { formatDate } from '@/lib/dates'
import PauseOptionButton from '@/features/supporter/components/PauseOptionButton'
import useManageSubscription, {
  storePlatform,
  type ManageSubscriptionSource,
  type StoreIntent,
} from '@/features/supporter/hooks/useManageSubscription'
import {
  pauseResumeDate,
  type ManageSubscriptionState,
  type PauseOffer,
} from '@/features/supporter/lib/supporterPause'
import { managementPage } from '@/features/supporter/lib/managementPage'

interface Props {
  open: boolean
  setOpen: (open: boolean) => void
  source: ManageSubscriptionSource
}

const isAndroid = storePlatform === 'android'
const isWeb = storePlatform === 'web'

/**
 * On the web, copy names the page Manage opens (`managementURL`): a store's, or
 * the subscription page.
 */
const webPageKey = <K extends string>(
  managementUrl: string | null,
  keys: { web: K; ios: K; android: K }
): K => {
  const page = managementPage(managementUrl)
  return page === 'app_store'
    ? keys.ios
    : page === 'play_store'
      ? keys.android
      : keys.web
}

/**
 * Manage Subscription: offers a Supporter Pause before cancelling, with the
 * store's own management (cancel or change) always one tap away in the footer.
 */
const ManageSubscriptionSheet = ({ open, setOpen, source }: Props) => {
  const theme = useTheme()
  const {
    state,
    canManage,
    managementUrl,
    productLoaded,
    productError,
    retryProduct,
    pausingMonths,
    pause,
    openStore,
  } = useManageSubscription(open, source)
  // The store's management sheet presents on the topmost view controller, so
  // open it only once this sheet is gone.
  const afterDismiss = useRef<(() => void) | null>(null)
  const pausing = pausingMonths !== null

  const close = () => {
    if (pausing) return
    setOpen(false)
  }

  const closeThenOpenStore = (intent: StoreIntent) => {
    if (pausing) return
    if (isWeb) {
      // A new tab opens only from the press itself.
      void openStore(intent)
      setOpen(false)
      return
    }
    afterDismiss.current = () => void openStore(intent)
    setOpen(false)
  }

  const storeButtonLabel = isWeb
    ? i18n.t('manageSupport_manageWeb')
    : state.kind === 'ending' || state.kind === 'none'
      ? i18n.t(
          isAndroid
            ? 'manageSupport_manageInStoreAndroid'
            : 'manageSupport_manageInStore'
        )
      : i18n.t('manageSupport_cancelOrChange')
  const storeHint = i18n.t(
    isWeb
      ? webPageKey(managementUrl, {
          web: 'manageSupport_storeHintWeb',
          ios: 'manageSupport_storeHint',
          android: 'manageSupport_storeHintAndroid',
        })
      : isAndroid
        ? 'manageSupport_storeHintAndroid'
        : 'manageSupport_storeHint'
  )

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      onClosed={() => {
        const then = afterDismiss.current
        afterDismiss.current = null
        then?.()
      }}
      // A pause in flight finishes before the sheet can go.
      dismissible={!pausing}
    >
      <View
        style={{
          width: '100%',
          maxWidth: inputLayout.contentMaxWidth,
          alignSelf: 'center',
          padding: 24,
          paddingBottom: 32,
          gap: 20,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <View style={{ flex: 1, gap: 6 }}>
            <Text
              style={{
                fontSize: theme.fontSize('xl'),
                fontFamily: theme.fonts.bold,
                color: theme.colors.text,
              }}
            >
              {i18n.t('manageSupport_title')}
            </Text>
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
                lineHeight: 20,
              }}
            >
              {i18n.t('manageSupport_thanks')}
            </Text>
          </View>
          <IconButton
            noTransform
            icon={XIcon}
            size='xl'
            onPress={close}
            accessibilityLabel={i18n.t('close')}
          />
        </View>

        <ManageSubscriptionBody
          state={state}
          managementUrl={managementUrl}
          productLoaded={productLoaded}
          productError={productError}
          onRetryProduct={retryProduct}
          pausingMonths={pausingMonths}
          onPause={(offer) => void pause(offer)}
          onPlayPause={() => closeThenOpenStore('pause')}
        />

        {canManage && (
          <View style={{ gap: 8 }}>
            <Button
              noTransform
              variant='outline'
              disabled={pausing}
              onPress={() => closeThenOpenStore('cancel')}
              style={{
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderRadius: theme.numbers.borderRadiusSm,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pausing ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('md'),
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                }}
              >
                {storeButtonLabel}
              </Text>
            </Button>
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: theme.colors.textAlt,
                textAlign: 'center',
              }}
            >
              {storeHint}
            </Text>
          </View>
        )}
      </View>
    </Sheet>
  )
}

const ManageSubscriptionBody = ({
  state,
  managementUrl,
  productLoaded,
  productError,
  onRetryProduct,
  pausingMonths,
  onPause,
  onPlayPause,
}: {
  state: ManageSubscriptionState
  /** Where Manage opens on the web, which its copy names. */
  managementUrl: string | null
  productLoaded: boolean
  productError: 'offline' | 'failed' | null
  onRetryProduct: () => void
  pausingMonths: number | null
  onPause: (offer: PauseOffer) => void
  onPlayPause: () => void
}) => {
  const theme = useTheme()
  const bodyStyle = {
    fontSize: theme.fontSize('sm'),
    color: theme.colors.textAlt,
    lineHeight: 20,
  }

  if (state.kind === 'none') return null

  if (state.kind === 'ending') {
    return (
      <Text style={bodyStyle}>
        {state.endsAt
          ? i18n.t('manageSupport_endingDescription', {
              date: formatDate(state.endsAt),
            })
          : i18n.t('manageSupport_endingDescriptionNoDate')}
      </Text>
    )
  }

  if (state.kind === 'paused') {
    return (
      <View
        style={{
          gap: 6,
          padding: 16,
          borderRadius: theme.numbers.borderRadiusSm,
          borderWidth: 1,
          borderColor: theme.colors.supporter,
          backgroundColor: theme.colors.supporterTranslucent,
        }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.text,
          }}
        >
          {i18n.t('manageSupport_pausedTitle')}
        </Text>
        <Text style={bodyStyle}>
          {i18n.t('manageSupport_pausedDescription', {
            date: formatDate(state.resumesAt),
          })}
        </Text>
      </View>
    )
  }

  const { pause, sub } = state

  if (!productLoaded) {
    return <Spinner color={theme.colors.textAlt} />
  }

  // These two only mean "no pause" when the product loaded.
  if (
    productError &&
    pause.kind === 'unavailable' &&
    (pause.reason === 'no_offers' || pause.reason === 'unsupported_plan')
  ) {
    return (
      <InlineNotice
        tone={productError === 'offline' ? 'offline' : 'error'}
        message={i18n.t('manageSupport_pauseLoadFailed')}
        onRetry={onRetryProduct}
      />
    )
  }

  if (pause.kind === 'unavailable') {
    if (pause.reason === 'cooldown' && pause.availableAgainAt) {
      return (
        <Text style={bodyStyle}>
          {i18n.t('manageSupport_pauseAgainAfter', {
            date: formatDate(pause.availableAgainAt),
          })}
        </Text>
      )
    }
    if (pause.reason === 'billing_issue') {
      return (
        <Text style={bodyStyle}>
          {i18n.t(
            isWeb
              ? webPageKey(managementUrl, {
                  web: 'manageSupport_billingIssueWeb',
                  ios: 'manageSupport_billingIssue',
                  android: 'manageSupport_billingIssueAndroid',
                })
              : isAndroid
                ? 'manageSupport_billingIssueAndroid'
                : 'manageSupport_billingIssue'
          )}
        </Text>
      )
    }
    return null
  }

  return (
    <View style={{ gap: 10 }}>
      <XView style={{ gap: 0 }}>
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.text,
          }}
        >
          {i18n.t(
            isAndroid
              ? 'manageSupport_pauseTitleAndroid'
              : 'manageSupport_pauseTitle'
          )}
        </Text>
        {pause.kind === 'offers' && (
          <InfoPopover
            inline
            title={i18n.t('manageSupport_pauseTitle')}
            description={i18n.t('manageSupport_pauseInfo')}
          />
        )}
      </XView>
      <Text style={bodyStyle}>
        {pause.kind === 'offers'
          ? i18n.t('manageSupport_pauseDescription', {
              date: formatDate(sub.expiresDate),
            })
          : i18n.t('manageSupport_pauseDescriptionAndroid')}
      </Text>
      {pause.kind === 'offers' ? (
        pause.offers.map((offer) => (
          <PauseOptionButton
            key={offer.months}
            title={
              // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
              i18n.t('manageSupport_pauseFor', { count: offer.months })
            }
            detail={i18n.t('manageSupport_nextPayment', {
              date: formatDate(pauseResumeDate(sub.expiresDate, offer.months)),
            })}
            busy={pausingMonths === offer.months}
            disabled={pausingMonths !== null}
            onPress={() => onPause(offer)}
          />
        ))
      ) : (
        <PauseOptionButton
          title={i18n.t('manageSupport_playPause')}
          detail={i18n.t('manageSupport_playPauseDetail')}
          onPress={onPlayPause}
        />
      )}
    </View>
  )
}

export default ManageSubscriptionSheet
