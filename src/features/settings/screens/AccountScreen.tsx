import { ScrollView } from 'react-native'
import Wrapper from '@/components/ui/layout/Wrapper'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import AccountStatusSection from '@/features/settings/components/account/AccountStatusSection'
import RecoveryKeySection from '@/features/settings/components/account/RecoveryKeySection'
import useAccountOverview from '@/features/settings/hooks/useAccountOverview'

/**
 * Settings → Account: the anonymous server account (ADR 0024) and its recovery
 * key (ADR 0026).
 */
const AccountScreen = () => {
  const { overview, refresh } = useAccountOverview()
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <ScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
        >
          <AccountStatusSection overview={overview} />
          <RecoveryKeySection onAccountChanged={() => void refresh()} />
        </ScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default AccountScreen
