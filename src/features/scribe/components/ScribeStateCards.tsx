import { useState, type ReactNode } from 'react'
import { View } from 'react-native'
import {
  CircleAlert as CircleAlertIcon,
  Gauge as GaugeIcon,
  MessageSquareText as MessageSquareTextIcon,
  WifiOff as WifiOffIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n, { type TranslationKey } from '@/lib/locales'
import { openStoreListing } from '@/lib/storeListing'
import { useSupporter } from '@/stores/supporterStatus'
import type { ScribeAvailability, ScribePlan } from '@/features/scribe/types'
import { recheckSupporter } from '@/features/scribe/runtime/status'
import {
  blockedCopy,
  formatResetTime,
} from '@/features/scribe/components/scribeCopy'

export type RenderSupporterCta = (props: { onPress: () => void }) => ReactNode

const Panel = ({
  icon,
  tone,
  title,
  body,
  children,
}: {
  icon: AppIcon
  tone: 'warn' | 'muted'
  title?: string
  body?: string
  children?: ReactNode
}) => {
  const theme = useTheme()
  const color = tone === 'warn' ? theme.colors.warnText : theme.colors.textAlt
  return (
    <View
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        padding: 16,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor:
              tone === 'warn'
                ? theme.colors.warnTranslucent
                : theme.colors.backgroundLighter,
          }}
        >
          <LucideIcon icon={icon} size={18} color={color} />
        </View>
        <View style={{ flex: 1, gap: 3, paddingTop: title ? 0 : 7 }}>
          {title ? (
            <Text
              accessibilityRole='header'
              style={{
                fontSize: theme.fontSize('md') + 1,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {title}
            </Text>
          ) : null}
          {body ? (
            <Text
              style={{
                fontSize: theme.fontSize('sm') + 1,
                color: title ? theme.colors.textAlt : theme.colors.text,
                lineHeight: 20,
              }}
            >
              {body}
            </Text>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  )
}

const PanelButton = ({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) => {
  const theme = useTheme()
  return (
    <Button
      noTransform
      onPress={onPress}
      style={{
        minHeight: 48,
        borderRadius: 999,
        backgroundColor: theme.colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
      }}
    >
      <Text
        style={{
          fontSize: theme.fontSize('md'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textInverse,
        }}
      >
        {label}
      </Text>
    </Button>
  )
}

export const ScribeSupporterNote = ({
  plan,
  supporterCheckFailed,
  onUpgrade,
  renderSupporterCta,
  fontSize,
}: {
  plan: ScribePlan
  supporterCheckFailed: boolean
  onUpgrade: () => void
  renderSupporterCta?: RenderSupporterCta
  fontSize: number
}) => {
  const theme = useTheme()
  const knownSupporter = useSupporter((state) => state.isSupporter)
  const [checking, setChecking] = useState(false)
  if (plan !== 'free') return null

  const note = (key: TranslationKey) => (
    <Text style={{ fontSize, color: theme.colors.text }}>{i18n.t(key)}</Text>
  )
  if (supporterCheckFailed) return note('scribe_usageSupporterCheckFailed')
  if (knownSupporter) {
    const recheck = async () => {
      setChecking(true)
      try {
        const supporter = await recheckSupporter()
        analytics.capture('scribe_supporter_rechecked', { supporter })
      } finally {
        setChecking(false)
      }
    }
    return (
      <View style={{ gap: 10 }}>
        {note('scribe_supporterNotSeen')}
        <PanelButton
          label={i18n.t(
            checking ? 'scribe_supporterChecking' : 'scribe_supporterCheckAgain'
          )}
          onPress={() => {
            if (!checking) void recheck()
          }}
        />
      </View>
    )
  }
  return (
    <View style={{ gap: 10 }}>
      {note('scribe_limitUpsell')}
      {renderSupporterCta ? (
        renderSupporterCta({ onPress: onUpgrade })
      ) : (
        <PanelButton
          label={i18n.t('scribe_becomeSupporter')}
          onPress={onUpgrade}
        />
      )}
    </View>
  )
}

export const ScribeLimitCard = ({
  plan,
  supporterCheckFailed = false,
  resetsAt,
  onUpgrade,
  renderSupporterCta,
}: {
  plan: ScribePlan
  supporterCheckFailed?: boolean
  resetsAt: number | null
  onUpgrade: () => void
  renderSupporterCta?: RenderSupporterCta
}) => {
  const theme = useTheme()
  return (
    <Panel
      icon={GaugeIcon}
      tone='warn'
      title={i18n.t('scribe_limitTitle')}
      body={
        resetsAt
          ? i18n.t('scribe_limitBody', { when: formatResetTime(resetsAt) })
          : undefined
      }
    >
      <ScribeSupporterNote
        plan={plan}
        supporterCheckFailed={supporterCheckFailed}
        onUpgrade={onUpgrade}
        renderSupporterCta={renderSupporterCta}
        fontSize={theme.fontSize('sm') + 1}
      />
    </Panel>
  )
}

type BlockedReason = Extract<
  ScribeAvailability,
  { status: 'blocked' }
>['reason']

export const ScribeBlockedCard = ({ reason }: { reason: BlockedReason }) => (
  <Panel icon={CircleAlertIcon} tone='warn' body={i18n.t(blockedCopy(reason))}>
    {reason === 'update_required' ? (
      <PanelButton
        label={i18n.t('update')}
        onPress={() => void openStoreListing()}
      />
    ) : null}
  </Panel>
)

export const ScribeUnavailableCard = () => (
  <Panel
    icon={CircleAlertIcon}
    tone='muted'
    body={i18n.t('scribe_errorUnavailable')}
  />
)

export const ScribeFullCard = ({
  onNewConversation,
}: {
  onNewConversation: () => void
}) => (
  <Panel
    icon={MessageSquareTextIcon}
    tone='muted'
    body={i18n.t('scribe_contextFull')}
  >
    <PanelButton
      label={i18n.t('scribe_newConversation')}
      onPress={onNewConversation}
    />
  </Panel>
)

const Banner = ({
  icon,
  text,
  action,
}: {
  icon: AppIcon
  text: string
  action?: { label: string; onPress: () => void }
}) => {
  const theme = useTheme()
  return (
    <View
      accessibilityLiveRegion='polite'
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 12,
        paddingRight: action ? 4 : 12,
        minHeight: 44,
        borderRadius: 14,
        backgroundColor: theme.colors.warnTranslucent,
      }}
    >
      <LucideIcon icon={icon} size={15} color={theme.colors.warnText} />
      <Text
        style={{
          flex: 1,
          fontSize: theme.fontSize('sm'),
          color: theme.colors.text,
        }}
      >
        {text}
      </Text>
      {action ? (
        <Button
          noTransform
          onPress={action.onPress}
          style={{
            minHeight: 44,
            paddingHorizontal: 10,
            justifyContent: 'center',
            borderRadius: 10,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.accent,
            }}
          >
            {action.label}
          </Text>
        </Button>
      ) : null}
    </View>
  )
}

export const ScribeNearFullBanner = ({
  onNewConversation,
}: {
  onNewConversation: () => void
}) => (
  <Banner
    icon={MessageSquareTextIcon}
    text={i18n.t('scribe_contextNearFull')}
    action={{
      label: i18n.t('scribe_newConversation'),
      onPress: onNewConversation,
    }}
  />
)

export const ScribeOfflineBanner = () => (
  <Banner icon={WifiOffIcon} text={i18n.t('scribe_offlineBadge')} />
)
