import {
  Check as CheckIcon,
  CreditCard as CreditCardIcon,
  ExternalLink as ExternalLinkIcon,
  HeartOff as HeartOffIcon,
  MessageSquareText as MessageSquareTextIcon,
  X as XIcon,
} from 'lucide-react-native'
import { PostHogProvider, SurveyModal } from 'posthog-react-native'
import { useRef, useState, type ReactNode } from 'react'
import { View } from 'react-native'
import Spinner from '@/components/ui/Spinner'
import Sheet from '@/components/ui/Sheet'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import IconButton from '@/components/ui/IconButton'
import InlineNotice from '@/components/ui/InlineNotice'
import InfoPopover from '@/components/ui/InfoPopover'
import XView from '@/components/ui/layout/XView'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import DetailRow from '@/components/ui/inputs/DetailRow'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import i18n from '@/lib/locales'
import { formatDate } from '@/lib/dates'
import useManageSubscription, {
  storePlatform,
  type ManageSubscriptionSource,
  type StoreIntent,
} from '@/features/supporter/hooks/useManageSubscription'
import {
  pauseResumeDate,
  type ManageSubscriptionState,
  type PauseAvailability,
  type PauseOffer,
} from '@/features/supporter/lib/supporterPause'
import { managementPage } from '@/features/supporter/lib/managementPage'
import useCancelSurvey, {
  type CancelSurvey,
} from '@/features/supporter/hooks/useCancelSurvey'
import { surveyClient } from '@/lib/analytics'
import { surveyAppearance } from '@/lib/surveySdk'

interface Props {
  open: boolean
  setOpen: (open: boolean) => void
  source: ManageSubscriptionSource
}

type Step = 'overview' | 'lastThing'

const isAndroid = storePlatform === 'android'
const isWeb = storePlatform === 'web'

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

const storeKey = <K extends string>(
  managementUrl: string | null,
  keys: { web: K; ios: K; android: K }
): K =>
  isWeb ? webPageKey(managementUrl, keys) : isAndroid ? keys.android : keys.ios

const pauseLoadFailed = (
  pause: PauseAvailability,
  productError: 'offline' | 'failed' | null
) =>
  productError !== null &&
  pause.kind === 'unavailable' &&
  (pause.reason === 'no_offers' || pause.reason === 'unsupported_plan')

const pauseOffered = (
  state: ManageSubscriptionState,
  productError: 'offline' | 'failed' | null
) =>
  state.kind === 'renewing' &&
  (state.pause.kind === 'offers' ||
    state.pause.kind === 'play' ||
    pauseLoadFailed(state.pause, productError))

const surveyOffered = (state: ManageSubscriptionState, survey: CancelSurvey) =>
  (state.kind === 'renewing' || state.kind === 'paused') &&
  (survey.available || survey.sent || survey.opened !== null)

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
    trackCancelTapped,
  } = useManageSubscription(open, source)

  const survey = useCancelSurvey(open)
  const [step, setStep] = useState<Step>('overview')
  const afterDismiss = useRef<(() => void) | null>(null)
  const pausing = pausingMonths !== null
  const surveying = survey.opened !== null
  const showLastThing =
    step === 'lastThing' &&
    (pauseOffered(state, productError) || surveyOffered(state, survey))

  const close = () => {
    if (pausing || surveying) return
    setOpen(false)
  }

  const closeThenOpenStore = (intent: StoreIntent) => {
    if (pausing || surveying) return
    if (isWeb) {
      void openStore(intent)
      setOpen(false)
      return
    }
    afterDismiss.current = () => void openStore(intent)
    setOpen(false)
  }

  const startCancel = () => {
    const pauseShown = pauseOffered(state, productError)
    const surveyShown = surveyOffered(state, survey)
    trackCancelTapped(pauseShown, surveyShown)
    if (pauseShown || surveyShown) setStep('lastThing')
    else closeThenOpenStore('cancel')
  }

  const storeHint = i18n.t(
    storeKey(managementUrl, {
      web: 'manageSupport_storeHintWeb',
      ios: 'manageSupport_storeHint',
      android: 'manageSupport_storeHintAndroid',
    })
  )

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      onClosed={() => {
        setStep('overview')
        const then = afterDismiss.current
        afterDismiss.current = null
        then?.()
      }}
      dismissible={!pausing && !surveying}
      backgroundColor={theme.colors.background}
    >
      <View
        style={{
          width: '100%',
          maxWidth: inputLayout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: inputLayout.horizontalPadding,
          paddingTop: 22,
          paddingBottom: 32,
          gap: 20,
        }}
      >
        {showLastThing ? (
          <LastThing
            state={state}
            survey={survey}
            productError={productError}
            onRetryProduct={retryProduct}
            pausingMonths={pausingMonths}
            onPause={(offer) => void pause(offer)}
            onPlayPause={() => closeThenOpenStore('pause')}
            onContinue={() => closeThenOpenStore('cancel')}
            storeHint={storeHint}
            onClose={close}
          />
        ) : (
          <Overview
            state={state}
            canManage={canManage}
            managementUrl={managementUrl}
            cancelLoading={
              state.kind === 'renewing' && !isWeb && !productLoaded
            }
            onManage={() => closeThenOpenStore('manage')}
            onCancel={startCancel}
            storeHint={storeHint}
            onClose={close}
          />
        )}
        {survey.opened && surveyClient ? (
          <PostHogProvider
            client={surveyClient}
            autocapture={false}
            style={{ flex: 0 }}
          >
            <SurveyModal
              survey={survey.opened.survey}
              surveyLanguage={survey.opened.matchedKey}
              appearance={{
                ...surveyAppearance(theme.colors),
                ...survey.opened.survey.appearance,
              }}
              onShow={survey.shown}
              onClose={(submitted) => survey.finish(submitted)}
            />
          </PostHogProvider>
        ) : null}
      </View>
    </Sheet>
  )
}

const Header = ({
  title,
  description,
  info,
  onClose,
}: {
  title: string
  description: string
  info?: { title: string; description: string }
  onClose: () => void
}) => {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        paddingHorizontal: inputLayout.horizontalPadding,
      }}
    >
      <View style={{ flex: 1, gap: 6 }}>
        <XView style={{ gap: 0 }}>
          <Text
            accessibilityRole='header'
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('xl'),
            }}
          >
            {title}
          </Text>
          {info && (
            <InfoPopover
              inline
              title={info.title}
              description={info.description}
            />
          )}
        </XView>
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
            lineHeight: 20,
          }}
        >
          {description}
        </Text>
      </View>
      <IconButton
        frame
        noTransform
        icon={XIcon}
        size={20}
        color={theme.colors.text}
        onPress={onClose}
        accessibilityLabel={i18n.t('close')}
      />
    </View>
  )
}

const Group = ({
  children,
  footer,
}: {
  children: ReactNode
  footer?: string | null
}) => {
  const theme = useTheme()
  return (
    <View style={{ gap: 8 }}>
      <Section>{children}</Section>
      {footer ? (
        <Text
          style={{
            marginHorizontal: inputLayout.horizontalPadding,
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textAlt,
            lineHeight: 18,
          }}
        >
          {footer}
        </Text>
      ) : null}
    </View>
  )
}

const Accessory = ({ external }: { external?: boolean }) => (
  <IconButton icon={external ? ExternalLinkIcon : ChevronForwardIcon} />
)

const statusRow = (
  state: ManageSubscriptionState
): { label: string; value: string } | null => {
  switch (state.kind) {
    case 'renewing':
      return state.renewsAt
        ? {
            label: i18n.t('manageSupport_renewsLabel'),
            value: formatDate(state.renewsAt),
          }
        : null
    case 'ending':
      return state.endsAt
        ? {
            label: i18n.t('manageSupport_endsLabel'),
            value: formatDate(state.endsAt),
          }
        : null
    case 'paused':
      return {
        label: i18n.t('manageSupport_resumesLabel'),
        value: formatDate(state.resumesAt),
      }
    case 'none':
      return null
  }
}

const statusFooter = (
  state: ManageSubscriptionState,
  managementUrl: string | null
): string | null => {
  switch (state.kind) {
    case 'ending':
      return state.endsAt
        ? i18n.t('manageSupport_endingFooter')
        : i18n.t('manageSupport_endingDescriptionNoDate')
    case 'paused':
      return i18n.t('manageSupport_pausedFooter')
    case 'renewing':
      if (
        state.pause.kind === 'unavailable' &&
        state.pause.reason === 'billing_issue'
      ) {
        return i18n.t(
          storeKey(managementUrl, {
            web: 'manageSupport_billingIssueWeb',
            ios: 'manageSupport_billingIssue',
            android: 'manageSupport_billingIssueAndroid',
          })
        )
      }
      if (
        state.pause.kind === 'unavailable' &&
        state.pause.reason === 'cooldown' &&
        state.pause.availableAgainAt
      ) {
        return i18n.t('manageSupport_pauseAgainAfter', {
          date: formatDate(state.pause.availableAgainAt),
        })
      }
      return null
    case 'none':
      return null
  }
}

const Overview = ({
  state,
  canManage,
  managementUrl,
  cancelLoading,
  onManage,
  onCancel,
  storeHint,
  onClose,
}: {
  state: ManageSubscriptionState
  canManage: boolean
  managementUrl: string | null
  cancelLoading: boolean
  onManage: () => void
  onCancel: () => void
  storeHint: string
  onClose: () => void
}) => {
  const theme = useTheme()
  const status = statusRow(state)
  const footer = statusFooter(state, managementUrl)
  const canCancel = state.kind === 'renewing' || state.kind === 'paused'
  const manageLabel = isWeb
    ? i18n.t('manageSupport_manageWeb')
    : canCancel
      ? i18n.t('manageSupport_changePlan')
      : i18n.t(
          isAndroid
            ? 'manageSupport_manageInStoreAndroid'
            : 'manageSupport_manageInStore'
        )

  return (
    <>
      <Header
        title={i18n.t('manageSupport_title')}
        description={i18n.t('manageSupport_thanks')}
        onClose={onClose}
      />

      {status ? (
        <Group footer={footer}>
          <DetailRow label={status.label} value={status.value} last />
        </Group>
      ) : footer ? (
        <Text
          style={{
            marginHorizontal: inputLayout.horizontalPadding,
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {footer}
        </Text>
      ) : null}

      {canManage && (
        <Group footer={storeHint}>
          <InputRowButton
            key='manage'
            leftIcon={CreditCardIcon}
            label={manageLabel}
            onPress={onManage}
            lastInSection={!canCancel}
          >
            <Accessory external />
          </InputRowButton>
          {canCancel && (
            <InputRowButton
              key='cancel'
              leftIcon={HeartOffIcon}
              leftIconColor={theme.colors.error}
              label={i18n.t('manageSupport_cancel')}
              onPress={onCancel}
              disabled={cancelLoading}
              lastInSection
            >
              {cancelLoading ? (
                <Spinner color={theme.colors.textAlt} />
              ) : (
                <Accessory />
              )}
            </InputRowButton>
          )}
        </Group>
      )}
    </>
  )
}

const LastThing = ({
  state,
  survey,
  productError,
  onRetryProduct,
  pausingMonths,
  onPause,
  onPlayPause,
  onContinue,
  storeHint,
  onClose,
}: {
  state: ManageSubscriptionState
  survey: CancelSurvey
  productError: 'offline' | 'failed' | null
  onRetryProduct: () => void
  pausingMonths: number | null
  onPause: (offer: PauseOffer) => void
  onPlayPause: () => void
  onContinue: () => void
  storeHint: string
  onClose: () => void
}) => {
  const theme = useTheme()
  const pause: PauseAvailability =
    state.kind === 'renewing'
      ? state.pause
      : { kind: 'unavailable', reason: 'no_offers' }
  const sub = state.kind === 'none' ? null : state.sub
  const pausing = pausingMonths !== null
  const offersPause =
    pause.kind === 'offers' ||
    pause.kind === 'play' ||
    pauseLoadFailed(pause, productError)

  return (
    <>
      <Header
        title={i18n.t('manageSupport_lastThingTitle')}
        description={
          !offersPause
            ? i18n.t('manageSupport_surveyOnlyDescription')
            : pause.kind === 'play'
              ? i18n.t('manageSupport_pauseDescriptionAndroid')
              : i18n.t('manageSupport_pauseDescription', {
                  date: formatDate(sub?.expiresDate ?? new Date()),
                })
        }
        info={
          pause.kind === 'offers'
            ? {
                title: i18n.t('manageSupport_pauseTitle'),
                description: i18n.t('manageSupport_pauseInfo'),
              }
            : undefined
        }
        onClose={onClose}
      />

      {pause.kind === 'offers' ? (
        <Group>
          {pause.offers.map((offer, index) => {
            const busy = pausingMonths === offer.months
            return (
              <InputRowButton
                key={offer.months}
                label={i18n.t('manageSupport_pauseFor', {
                  count: offer.months,
                })}
                sublabel={i18n.t('manageSupport_nextPayment', {
                  date: formatDate(
                    pauseResumeDate(sub?.expiresDate ?? null, offer.months)
                  ),
                })}
                onPress={() => onPause(offer)}
                disabled={pausing && !busy}
                lastInSection={index === pause.offers.length - 1}
              >
                {busy ? <Spinner color={theme.colors.textAlt} /> : null}
              </InputRowButton>
            )
          })}
        </Group>
      ) : pause.kind === 'play' ? (
        <Group>
          <InputRowButton
            key='play'
            label={i18n.t('manageSupport_playPause')}
            sublabel={i18n.t('manageSupport_playPauseDetail')}
            onPress={onPlayPause}
            lastInSection
          >
            <Accessory external />
          </InputRowButton>
        </Group>
      ) : pauseLoadFailed(pause, productError) ? (
        <InlineNotice
          tone={productError === 'offline' ? 'offline' : 'error'}
          message={i18n.t('manageSupport_pauseLoadFailed')}
          onRetry={onRetryProduct}
        />
      ) : null}

      {survey.sent ? (
        <Group>
          <InputRowButton
            key='surveySent'
            leftIcon={CheckIcon}
            leftIconColor={theme.colors.accent}
            label={i18n.t('manageSupport_surveySent')}
            lastInSection
          />
        </Group>
      ) : survey.available ? (
        <Group>
          <InputRowButton
            key='survey'
            leftIcon={MessageSquareTextIcon}
            label={i18n.t('manageSupport_survey')}
            sublabel={i18n.t('manageSupport_surveyDetail')}
            onPress={survey.open}
            disabled={pausing}
            lastInSection
          >
            <Accessory />
          </InputRowButton>
        </Group>
      ) : null}

      <Group footer={storeHint}>
        <InputRowButton
          key='continue'
          leftIcon={HeartOffIcon}
          leftIconColor={theme.colors.error}
          label={i18n.t('manageSupport_continueCancel')}
          onPress={onContinue}
          disabled={pausing}
          lastInSection
        >
          <Accessory external />
        </InputRowButton>
      </Group>
    </>
  )
}

export default ManageSubscriptionSheet
