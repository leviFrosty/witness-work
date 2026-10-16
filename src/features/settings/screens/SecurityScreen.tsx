import { ScrollView } from 'react-native'
import Wrapper from '@/components/ui/layout/Wrapper'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import SecuritySettingsSection from '@/features/settings/components/SecuritySettingsSection'

const SecurityScreen = () => {
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <ScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
        >
          <SecuritySettingsSection />
        </ScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default SecurityScreen
