import { Platform, useWindowDimensions, View } from 'react-native'
import {
  Activity as ActivityIcon,
  Hash as HashIcon,
  RefreshCw as RefreshCwIcon,
} from 'lucide-react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Text from '@/components/ui/MyText'
import Spinner from '@/components/ui/Spinner'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import SectionFooter from '@/features/settings/components/account/SectionFooter'
import type { AccountOverview } from '@/features/settings/hooks/useAccountOverview'
import { platformKey } from '@/app/account/attestationCopy'
import useTheme from '@/contexts/theme'
import { alignText } from '@/lib/direction'
import i18n, { type TranslationKey } from '@/lib/locales'

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' })

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

/**
 * The account number and whether it's active, suspended, unreachable, or out of
 * reach because this device couldn't prove it's WitnessWork.
 */
export default function AccountStatusSection({
  overview,
  onRetry,
}: {
  overview: AccountOverview
  /** Verify this device again now (Try Again). */
  onRetry?: () => void
}) {
  const theme = useTheme()
  // The account number is one long unbreakable word. Beside the label it
  // leaves the label no room once text is enlarged ("Accou / nt / Numb / er"),
  // so from there it goes under the label.
  const numberUnderLabel = useWindowDimensions().fontScale > 1
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
      <SectionTitle text={i18n.t('account_title')} alignWithIcons />
      <Section>
        <InputRowContainer
          leftIcon={HashIcon}
          label={i18n.t('account_number')}
          info={i18n.t('account_numberInfo')}
          controlWidth={numberUnderLabel ? 'full' : 'auto'}
          style={{ justifyContent: 'space-between' }}
        >
          <Text
            selectable
            testID='account-number'
            style={{
              flexShrink: 1,
              textAlign: alignText(numberUnderLabel ? 'start' : 'end'),
              fontFamily: accountId ? MONO : theme.fonts.regular,
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {accountId ?? i18n.t('account_numberNone')}
          </Text>
        </InputRowContainer>
        <InputRowContainer
          leftIcon={ActivityIcon}
          label={i18n.t('account_status')}
          controlWidth='auto'
          style={{ justifyContent: 'space-between' }}
          lastInSection={!retry}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {overview.state === 'checking' && <Spinner size='small' />}
            <Text
              testID='account-status'
              style={{
                fontFamily: theme.fonts.semiBold,
                color: statusColor,
              }}
            >
              {i18n.t(status)}
            </Text>
          </View>
        </InputRowContainer>
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
