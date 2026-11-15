import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import {
  History as HistoryIcon,
  UserRoundKey as UserRoundKeyIcon,
} from 'lucide-react-native'
import Wrapper from '@/components/ui/layout/Wrapper'
import Section from '@/components/ui/inputs/Section'
import AccountNavRow from '@/features/settings/components/account/AccountNavRow'
import SettingsScrollView from '@/features/settings/components/shared/SettingsScrollView'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import RecoveryKeySection from '@/features/settings/components/account/RecoveryKeySection'
import useAccountOverview from '@/features/settings/hooks/useAccountOverview'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'

const AccountSecurityScreen = () => {
  const navigation = useNavigation<RootStackNavigation>()
  const { overview, refresh } = useAccountOverview()
  const state = overview.state

  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <SettingsScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
        >
          <RecoveryKeySection
            onAccountChanged={() => void refresh()}
            canChangeKey={
              state === 'active' ||
              state === 'suspended' ||
              state === 'offline' ||
              state === 'unreachable'
            }
          />
          {state !== 'notSetUp' && (
            <View style={{ gap: 5 }}>
              <SectionTitle
                text={i18n.t('accountSecurity_signInSection')}
                info={i18n.t('accountSecurity_sectionInfo')}
                alignWithIcons
              />
              <Section>
                <AccountNavRow
                  icon={UserRoundKeyIcon}
                  label={i18n.t('accountSecurity_passkeys')}
                  onPress={() => navigation.navigate('Account Passkeys')}
                />
                <AccountNavRow
                  icon={HistoryIcon}
                  label={i18n.t('accountSecurity_activity')}
                  onPress={() => navigation.navigate('Account Activity')}
                  lastInSection
                />
              </Section>
            </View>
          )}
        </SettingsScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default AccountSecurityScreen
