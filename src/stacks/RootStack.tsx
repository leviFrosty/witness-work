import {
  NativeStackNavigationProp,
  createNativeStackNavigator,
} from '@react-navigation/native-stack'
import ContactForm from '../screens/ContactForm'
import Header from '../components/layout/Header'
import ConversationForm from '../screens/ConversationForm'
import ContactSelector from '../screens/ContactSelector'
import useTheme from '../contexts/theme'
import ContactDetails from '../screens/ContactDetails'
import AddTime from '../screens/AddTime'
import TimeReports from '../screens/TimeReports'
import RecoverContacts from '../screens/RecoverContacts'
import OnBoarding from '../components/onboarding/Onboarding'
import { usePreferences } from '../stores/preferences'
import Update from '../screens/Update'
import IconButton from '../components/IconButton'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import HomeTabStack from './DashboardTabStack'
import Preferences from '../screens/preferences/Preferences'
import i18n from '../lib/locales'
import WhatsNewScreen from '../screens/WhatsNew'

export type RootStackParamList = {
  Root: undefined
  'Conversation Form': {
    contactId?: string
    conversationToEditId?: string
    notAtHome?: boolean
  }
  'Contact Details': { id: string; highlightedConversationId?: string } // Contact ID
  'Contact Form': { id: string; edit?: boolean } // Contact ID
  'Contact Selector': undefined
  'Add Time': undefined
  'Time Reports': { month?: number; year?: number }
  'Recover Contacts': undefined
  Onboarding: undefined
  Update: undefined
  Preferences: undefined
  'Whats New': undefined
}

export type RootStackNavigation = NativeStackNavigationProp<RootStackParamList>
const RootStack = createNativeStackNavigator<RootStackParamList>()

const RootStackComponent = () => {
  const theme = useTheme()
  const { onboardingComplete } = usePreferences()

  return (
    <RootStack.Navigator>
      {/* 
      Cannot render onboarding via Navigator initialRouteName. 
      This alternative allows for dynamically rendering screen. 
      Navigating directly between conditional screens causes an error
      because from each screen's perspective the other screen does not exist. 
      You must update the variable instead. 
      See: https://github.com/react-navigation/react-navigation/discussions/10346
      */}
      {onboardingComplete ? (
        <RootStack.Screen
          options={{ header: () => undefined }}
          name='Root'
          component={HomeTabStack}
        />
      ) : (
        <RootStack.Screen
          options={{ header: () => undefined }}
          name='Onboarding'
          component={OnBoarding}
        />
      )}
      <RootStack.Screen name='Contact Details' component={ContactDetails} />
      <RootStack.Screen name='Contact Form' component={ContactForm} />
      <RootStack.Screen name='Conversation Form' component={ConversationForm} />
      <RootStack.Screen
        name='Contact Selector'
        component={ContactSelector}
        options={{
          presentation: 'formSheet',
          header: () => <Header noInsets buttonType='exit' />,
        }}
      />
      <RootStack.Screen
        name='Add Time'
        options={{
          presentation: 'modal',
          header: () => <Header noInsets buttonType='exit' />,
        }}
        component={AddTime}
      />
      <RootStack.Screen
        options={{
          header: ({ navigation }) => (
            <Header
              buttonType='back'
              title={i18n.t('timeReports')}
              rightElement={
                <IconButton
                  style={{ position: 'absolute', right: 0 }}
                  icon={faPlus}
                  onPress={() => navigation.navigate('Add Time')}
                  size='xl'
                  iconStyle={{ color: theme.colors.text }}
                />
              }
            />
          ),
        }}
        name='Time Reports'
        component={TimeReports}
      />
      <RootStack.Screen
        options={{
          presentation: 'modal',
          header: () => <Header noInsets buttonType='exit' />,
        }}
        name='Recover Contacts'
        component={RecoverContacts}
      />
      <RootStack.Screen
        options={{ header: () => undefined }}
        name='Update'
        component={Update}
      />
      <RootStack.Screen
        options={{
          header: () => (
            <Header buttonType='back' title={i18n.t('preferences')} />
          ),
        }}
        name='Preferences'
        component={Preferences}
      />
      <RootStack.Screen
        options={{
          header: () => <Header buttonType='back' title={i18n.t('whatsNew')} />,
        }}
        name='Whats New'
        component={WhatsNewScreen}
      />
    </RootStack.Navigator>
  )
}

export default RootStackComponent
