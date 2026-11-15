import { Platform, View } from 'react-native'
import {
  KeyRound as KeyRoundIcon,
  RefreshCw as RefreshCwIcon,
} from 'lucide-react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Spinner from '@/components/ui/Spinner'
import SectionFooter from '@/features/settings/components/account/SectionFooter'
import type { AccountOverview } from '@/features/settings/hooks/useAccountOverview'
import { platformKey } from '@/app/account/attestationCopy'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' })
const AVATAR = 64
const INFO_BUTTON = 44

const STATUS: Record<AccountOverview['state'], TranslationKey> = {
  checking: 'account_statusChecking',
  notSetUp: 'account_statusNotSetUp',
  active: 'account_statusActive',
  suspended: 'account_statusSuspended',
  unavailable: 'account_statusUnavailable',
  unverified: 'account_statusUnverified',
  updateRequired: 'account_statusUpdate',
  offline: 'account_statusOffline',
  unreachable: 'account_statusUnreachable',
}

const FOOTER: Partial<Record<AccountOverview['state'], TranslationKey>> = {
  notSetUp: 'account_footerNotSetUp',
  suspended: 'account_footerSuspended',
  unavailable: 'account_footerUnavailable',
  unverified: platformKey(
    'account_footerUnverified',
    'account_footerUnverifiedAndroid'
  ),
  updateRequired: 'account_updateRequired',
  offline: 'account_footerOffline',
  unreachable: 'account_footerUnreachable',
}

export default function AccountHeader({
  overview,
  onRetry,
}: {
  overview: AccountOverview
  onRetry?: () => void
}) {
  const theme = useTheme()
  const accountId =
    ('accountId' in overview ? overview.accountId : null) ?? null
  const statusColor =
    overview.state === 'active'
      ? theme.colors.accent
      : overview.state === 'suspended'
        ? theme.colors.error
        : theme.colors.textAlt
  const temporary =
    overview.state === 'unverified' && overview.problem === 'temporary'
  const status = temporary
    ? 'account_statusVerifyLater'
    : STATUS[overview.state]
  const footer = temporary
    ? 'account_footerVerifyLater'
    : FOOTER[overview.state]
  const retry =
    overview.state === 'unverified' || overview.state === 'unreachable'
      ? onRetry
      : undefined

  return (
    <View style={{ gap: 5 }}>
      <Section>
        <View
          style={{
            alignItems: 'center',
            gap: 6,
            paddingTop: 22,
            paddingBottom: 20,
            paddingHorizontal: 20,
          }}
        >
          <View
            style={{
              width: AVATAR,
              height: AVATAR,
              borderRadius: AVATAR / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.accentTranslucent,
              marginBottom: 6,
            }}
          >
            <LucideIcon
              icon={KeyRoundIcon}
              size={30}
              color={theme.colors.accent}
            />
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              maxWidth: '100%',
            }}
          >
            <View style={{ width: INFO_BUTTON }} />
            <Text
              selectable
              testID='account-number'
              accessibilityLabel={`${i18n.t('account_number')}, ${
                accountId ?? i18n.t('account_numberNone')
              }`}
              style={{
                flexShrink: 1,
                textAlign: 'center',
                fontFamily: accountId ? MONO : theme.fonts.semiBold,
                fontSize: theme.fontSize(accountId ? 'md' : 'lg'),
                color: theme.colors.text,
              }}
            >
              {accountId ?? i18n.t('account_numberNone')}
            </Text>
            <InfoPopover
              title={i18n.t('account_number')}
              description={i18n.t('account_numberInfo')}
              inline
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {overview.state === 'checking' && <Spinner size='small' />}
            <Text
              testID='account-status'
              accessibilityLabel={`${i18n.t('account_status')}, ${i18n.t(status)}`}
              style={{
                fontFamily: theme.fonts.semiBold,
                color: statusColor,
              }}
            >
              {i18n.t(status)}
            </Text>
          </View>
        </View>
        {retry && (
          <InputRowButton
            leftIcon={RefreshCwIcon}
            label={i18n.t('account_verifyAgain')}
            onPress={retry}
            lastInSection
          />
        )}
      </Section>
      {footer && <SectionFooter text={i18n.t(footer)} />}
    </View>
  )
}
