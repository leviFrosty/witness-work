import {
  Calendar1 as Calendar1Icon,
  ChevronRight as ChevronRightIcon,
  FileOutput as FileOutputIcon,
  House as HouseIcon,
  LayoutGrid as LayoutGridIcon,
  MessagesSquare as MessagesSquareIcon,
  Route as RouteIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
} from 'lucide-react-native'
import Wrapper from '@/components/ui/layout/Wrapper'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/features/settings/components/inputs/InputRowButton'
import { Platform } from 'react-native'
import i18n from '@/lib/locales'
import { useNavigation } from '@react-navigation/native'
import IconButton from '@/components/ui/IconButton'
import { View } from 'react-native'
import { RootStackNavigation } from '@/types/rootStack'

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
              leftIcon={MessagesSquareIcon}
              label={i18n.t('conversations')}
              onPress={() => navigation.navigate('PreferencesConversation')}
            >
              <IconButton icon={ChevronRightIcon} />
            </InputRowButton>
            <InputRowButton
              leftIcon={Calendar1Icon}
              label={i18n.t('plans')}
              onPress={() => navigation.navigate('PreferencesPlans')}
            >
              <IconButton icon={ChevronRightIcon} />
            </InputRowButton>
            <InputRowButton
              leftIcon={RouteIcon}
              label={i18n.t('navigation')}
              onPress={() => navigation.navigate('PreferencesNavigation')}
            >
              <IconButton icon={ChevronRightIcon} />
            </InputRowButton>
            <InputRowButton
              leftIcon={SlidersHorizontalIcon}
              label={i18n.t('customFields')}
              onPress={() => navigation.navigate('PreferencesCustomFields')}
            >
              <IconButton icon={ChevronRightIcon} />
            </InputRowButton>
            <InputRowButton
              leftIcon={HouseIcon}
              label={i18n.t('homeScreen')}
              onPress={() => navigation.navigate('PreferencesHomeScreen')}
            >
              <IconButton icon={ChevronRightIcon} />
            </InputRowButton>
            {Platform.OS === 'ios' && (
              <InputRowButton
                leftIcon={LayoutGridIcon}
                label={i18n.t('widgets')}
                onPress={() => navigation.navigate('PreferencesWidgets')}
              >
                <IconButton icon={ChevronRightIcon} />
              </InputRowButton>
            )}
            <InputRowButton
              leftIcon={FileOutputIcon}
              label={i18n.t('backups')}
              onPress={() => navigation.navigate('PreferencesBackups')}
              lastInSection
            >
              <IconButton icon={ChevronRightIcon} />
            </InputRowButton>
          </Section>
        </View>
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default PreferencesScreen
