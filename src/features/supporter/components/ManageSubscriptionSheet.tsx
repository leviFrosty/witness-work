import { X as XIcon } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { Modal, Platform, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Sheet, Spinner } from 'tamagui'
import useTheme from '@/contexts/theme'
import useSheetBottomInset from '@/hooks/useSheetBottomInset'
import Text from '@/components/ui/MyText'
import IconButton from '@/components/ui/IconButton'
import Button from '@/components/ui/Button'
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

interface Props {
  open: boolean
  setOpen: (open: boolean) => void
  source: ManageSubscriptionSource
}

const isAndroid = storePlatform === 'android'

/**
 * Manage Subscription: offers a Supporter Pause before cancelling, with the
 * store's own management (cancel or change) always one tap away in the footer.
 */
const ManageSubscriptionSheet = ({ open, setOpen, source }: Props) => {
  const theme = useTheme()
  const sheetBottomInset = useSheetBottomInset()
  const { state, productLoaded, pausingMonths, pause, openStore } =
    useManageSubscription(open, source)
  // Keep the native Modal mounted through the Sheet's dismiss animation.
  const [mounted, setMounted] = useState(open)
  const afterDismiss = useRef<(() => void) | null>(null)
  const wasMounted = useRef(false)
  const pausing = pausingMonths !== null

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    const t = setTimeout(() => setMounted(false), 300)
    return () => clearTimeout(t)
  }, [open])

  // The store's management sheet presents on the topmost view controller, so
  // open it only once this Modal is gone. RN fires `onDismiss` on iOS only;
  // on Android, run it once the Modal unmounts.
  useEffect(() => {
    if (Platform.OS !== 'android') return
    if (mounted) {
      wasMounted.current = true
      return
    }
    if (!wasMounted.current) return
    wasMounted.current = false
    const then = afterDismiss.current
    afterDismiss.current = null
    then?.()
  }, [mounted])

  const close = () => {
    if (pausing) return
    setOpen(false)
  }

  const closeThenOpenStore = (intent: StoreIntent) => {
    if (pausing) return
    afterDismiss.current = () => void openStore(intent)
    setOpen(false)
    setMounted(false)
  }

  const storeButtonLabel =
    state.kind === 'ending' || state.kind === 'none'
      ? i18n.t(
          isAndroid
            ? 'manageSupport_manageInStoreAndroid'
            : 'manageSupport_manageInStore'
        )
      : i18n.t('manageSupport_cancelOrChange')

  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      animationType='none'
      onRequestClose={close}
      onDismiss={() => {
        const then = afterDismiss.current
        afterDismiss.current = null
        then?.()
      }}
    >
      {/* A Modal is its own native root; pointer hover on its buttons needs
          its own gesture handler root. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Sheet
          open={open}
          onOpenChange={(next: boolean) => {
            if (!next) close()
          }}
          dismissOnSnapToBottom
          modal={false}
          snapPointsMode='fit'
        >
          <Sheet.Handle />
          <Sheet.Overlay zIndex={100_000 - 1} />
          <Sheet.Frame paddingBottom={sheetBottomInset}>
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
                />
              </View>

              <ManageSubscriptionBody
                state={state}
                productLoaded={productLoaded}
                pausingMonths={pausingMonths}
                onPause={(offer) => void pause(offer)}
                onPlayPause={() => closeThenOpenStore('pause')}
              />

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
                  {i18n.t(
                    isAndroid
                      ? 'manageSupport_storeHintAndroid'
                      : 'manageSupport_storeHint'
                  )}
                </Text>
              </View>
            </View>
          </Sheet.Frame>
        </Sheet>
      </GestureHandlerRootView>
    </Modal>
  )
}

const ManageSubscriptionBody = ({
  state,
  productLoaded,
  pausingMonths,
  onPause,
  onPlayPause,
}: {
  state: ManageSubscriptionState
  productLoaded: boolean
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
            isAndroid
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
