import { Platform, View } from 'react-native'
import { Activity as ActivityIcon, Hash as HashIcon } from 'lucide-react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Text from '@/components/ui/MyText'
import Spinner from '@/components/ui/Spinner'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import SectionFooter from '@/features/settings/components/account/SectionFooter'
import type { AccountOverview } from '@/features/settings/hooks/useAccountOverview'
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
  offline: 'account_statusOffline',
}

const FOOTER: Partial<Record<AccountOverview['state'], TranslationKey>> = {
  notSetUp: 'account_footerNotSetUp',
  suspended: 'account_footerSuspended',
  unavailable: 'account_footerUnavailable',
  offline: 'account_footerOffline',
}

/** The account number and whether it's active, suspended, or unreachable. */
export default function AccountStatusSection({
  overview,
}: {
  overview: AccountOverview
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
  const footer = FOOTER[overview.state]

  return (
    <View style={{ gap: 5 }}>
      <SectionTitle text={i18n.t('account_title')} alignWithIcons />
      <Section>
        <InputRowContainer
          leftIcon={HashIcon}
          label={i18n.t('account_number')}
          info={i18n.t('account_numberInfo')}
          controlWidth='auto'
          style={{ justifyContent: 'space-between' }}
        >
          <Text
            selectable
            testID='account-number'
            style={{
              flexShrink: 1,
              textAlign: alignText('end'),
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
          lastInSection
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
              {i18n.t(STATUS[overview.state])}
            </Text>
          </View>
        </InputRowContainer>
      </Section>
      {footer && <SectionFooter text={i18n.t(footer)} />}
    </View>
  )
}
