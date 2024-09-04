import Wrapper from '../../../components/layout/Wrapper'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import AppPreferencesSection from './sections/AppPreferencesSection'
import Section from '../../../components/inputs/Section'
import InputRowButton from '../../../components/inputs/InputRowButton'
import {
  faChevronRight,
  faComments,
  faFileExport,
  faHome,
  faPalette,
  faRoute,
  faUser,
} from '@fortawesome/free-solid-svg-icons'
import i18n from '../../../lib/locales'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../../../stacks/RootStack'
import IconButton from '../../../components/IconButton'
import { View } from 'react-native'
import LanguageSelector from '../sections/LanguageSelector'

const PreferencesScreen = () => {
  const navigation = useNavigation<RootStackNavigation>()

  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
      >
        <Section>
          <LanguageSelector />
        </Section>
        <View style={{ gap: 5 }}>
          <Section>
            <InputRowButton
              leftIcon={faPalette}
              label={i18n.t('appearance')}
              onPress={() => navigation.navigate('PreferencesAppearance')}
            >
              <IconButton icon={faChevronRight} />
            </InputRowButton>
            <InputRowButton
              leftIcon={faUser}
              label={i18n.t('publisher')}
              onPress={() => navigation.navigate('PreferencesPublisher')}
            >
              <IconButton icon={faChevronRight} />
            </InputRowButton>
            <InputRowButton
              leftIcon={faComments}
              label={i18n.t('conversations')}
              onPress={() => navigation.navigate('PreferencesConversation')}
            >
              <IconButton icon={faChevronRight} />
            </InputRowButton>
            <InputRowButton
              leftIcon={faRoute}
              label={i18n.t('navigation')}
              onPress={() => navigation.navigate('PreferencesNavigation')}
            >
              <IconButton icon={faChevronRight} />
            </InputRowButton>
            <InputRowButton
              leftIcon={faHome}
              label={i18n.t('homeScreen')}
              onPress={() => navigation.navigate('PreferencesHomeScreen')}
            >
              <IconButton icon={faChevronRight} />
            </InputRowButton>
            <InputRowButton
              leftIcon={faFileExport}
              label={i18n.t('backups')}
              onPress={() => navigation.navigate('PreferencesBackups')}
              lastInSection
            >
              <IconButton icon={faChevronRight} />
            </InputRowButton>
          </Section>
        </View>

        <AppPreferencesSection />
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default PreferencesScreen
