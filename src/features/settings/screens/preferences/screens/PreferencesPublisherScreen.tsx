import SettingsScrollView from '@/features/settings/components/shared/SettingsScrollView'
import Wrapper from '@/components/ui/layout/Wrapper'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import PublisherPreferencesSection from '@/features/settings/components/preferences-sections/PublisherPreferencesSection'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'

const PreferencesPublisherScreen = () => {
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <SettingsScrollView>
          <ContentColumn style={{ paddingTop: 24, paddingBottom: 120 }}>
            <PublisherPreferencesSection />
          </ContentColumn>
        </SettingsScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default PreferencesPublisherScreen
