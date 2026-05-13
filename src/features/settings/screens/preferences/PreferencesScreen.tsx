import Wrapper from '../../../../components/layout/Wrapper'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Section from '../../../../components/inputs/Section'
import InputRowButton from '../../../../components/inputs/InputRowButton'
import {
  faCalendarDay,
  faChevronRight,
  faComments,
  faFileExport,
  faHome,
  faRoute,
  faSliders,
  faTableCellsLarge,
} from '@fortawesome/free-solid-svg-icons'
import { Platform } from 'react-native'
import i18n from '../../../../lib/locales'
import { useNavigation } from '@react-navigation/native'
import IconButton from '../../../../components/IconButton'
import { View } from 'react-native'
import { RootStackNavigation } from '../../../../types/rootStack'

const PreferencesScreen = () => {
  const navigation = useNavigation<RootStackNavigation>()

  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
      >
        <View style={{ gap: 5 }}>
          <Section>
            <InputRowButton
              leftIcon={faComments}
              label={i18n.t('conversations')}
              onPress={() => navigation.navigate('PreferencesConversation')}
            >
              <IconButton icon={faChevronRight} />
            </InputRowButton>
            <InputRowButton
              leftIcon={faCalendarDay}
              label={i18n.t('plans')}
              onPress={() => navigation.navigate('PreferencesPlans')}
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
              leftIcon={faSliders}
              label={i18n.t('customFields')}
              onPress={() => navigation.navigate('PreferencesCustomFields')}
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
            {Platform.OS === 'ios' && (
              <InputRowButton
                leftIcon={faTableCellsLarge}
                label={i18n.t('widgets')}
                onPress={() => navigation.navigate('PreferencesWidgets')}
              >
                <IconButton icon={faChevronRight} />
              </InputRowButton>
            )}
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
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default PreferencesScreen
