import { createNativeStackNavigator } from '@react-navigation/native-stack'
import ContactFormScreen from '../screens/ContactFormScreen'
import Header from '../components/layout/Header'
import ConversationFormScreen from '../screens/ConversationFormScreen'
import ContactDetailsScreen from '../screens/ContactDetailsScreen'
import AddTimeScreen from '../screens/AddTimeScreen'
import RecoverContactsScreen from '../screens/RecoverContactsScreen'
import DismissedContactsScreen from '../screens/DismissedContactsScreen'
import OnBoarding from '../components/onboarding/Onboarding'
import { usePreferences } from '../stores/preferences'
import UpdateScreen from '../screens/UpdateScreen'
import HomeTabStack from './HomeTabStack'
import PreferencesScreen from '../screens/settings/preferences/PreferencesScreen'
import i18n from '../lib/locales'
import WhatsNewScreen from '../screens/WhatsNewScreen'
import DonationInfoScreen from '../screens/DonationInfoScreen'
import PaywallScreen from '../screens/PaywallScreen'
import PaywallThankYouScreen from '../screens/PaywallThankYouScreen'
import ImportAndExportScreen from '../screens/ImportAndExportScreen'
import PreferencesPublisherScreen from '../screens/settings/preferences/screens/PreferencesPublisherScreen'
import PreferencesConversationScreen from '../screens/settings/preferences/screens/PreferencesConversationScreen'
import PreferencesNavigationScreen from '../screens/settings/preferences/screens/PreferencesNavigationScreen'
import PreferencesHomeScreen from '../screens/settings/preferences/screens/PreferencesHomeScreen'
import PreferencesBackupsScreen from '../screens/settings/preferences/screens/PreferencesBackupsScreen'
import PreferencesAppearanceScreen from '../screens/settings/preferences/screens/PreferencesAppearanceScreen'
import PlanScheduleScreen from '../screens/PlanScheduleScreen'
import PlanDayScreen from '../screens/PlanDayScreen'
import { RootStackParamList } from '../types/rootStack'

const RootStack = createNativeStackNavigator<RootStackParamList>()

const RootStackComponent = () => {
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
      <RootStack.Screen
        name='Contact Details'
        component={ContactDetailsScreen}
      />
      <RootStack.Screen name='Contact Form' component={ContactFormScreen} />
      <RootStack.Screen
        name='Conversation Form'
        component={ConversationFormScreen}
      />
      <RootStack.Screen
        name='Add Time'
        options={{
          header: () => (
            <Header noInsets buttonType='back' title={i18n.t('addTime')} />
          ),
        }}
        component={AddTimeScreen}
      />
      <RootStack.Screen
        options={{
          presentation: 'modal',
          header: () => <Header noInsets buttonType='back' title='' />,
        }}
        name='Recover Contacts'
        component={RecoverContactsScreen}
      />
      <RootStack.Screen
        options={{
          header: () => (
            <Header buttonType='back' title={i18n.t('dismissedContacts')} />
          ),
        }}
        name='Dismissed Contacts'
        component={DismissedContactsScreen}
      />
      <RootStack.Screen
        options={{ header: () => null }}
        name='Update'
        component={UpdateScreen}
      />
      <RootStack.Screen
        options={{
          header: () => (
            <Header buttonType='back' title={i18n.t('preferences')} />
          ),
        }}
        name='Preferences'
        component={PreferencesScreen}
      />
      <RootStack.Screen
        options={{
          header: () => <Header buttonType='back' title={i18n.t('whatsNew')} />,
        }}
        name='Whats New'
        component={WhatsNewScreen}
      />
      <RootStack.Screen
        options={{
          header: () => <Header buttonType='back' title={''} />,
        }}
        name='Donate'
        component={DonationInfoScreen}
      />
      <RootStack.Screen
        options={{
          header: () => <Header buttonType='back' title={i18n.t('donate')} />,
        }}
        name='Paywall'
        component={PaywallScreen}
      />
      <RootStack.Screen
        options={{
          header: () => null,
        }}
        name='Thank You'
        component={PaywallThankYouScreen}
      />
      <RootStack.Screen
        options={{
          header: () => (
            <Header buttonType='back' title={i18n.t('importAndExport')} />
          ),
        }}
        name='Import and Export'
        component={ImportAndExportScreen}
      />
      <RootStack.Screen
        options={{
          header: () => (
            <Header buttonType='back' title={i18n.t('publisher')} />
          ),
        }}
        name='PreferencesPublisher'
        component={PreferencesPublisherScreen}
      />
      <RootStack.Screen
        options={{
          header: () => (
            <Header buttonType='back' title={i18n.t('conversations')} />
          ),
        }}
        name='PreferencesConversation'
        component={PreferencesConversationScreen}
      />
      <RootStack.Screen
        options={{
          header: () => (
            <Header buttonType='back' title={i18n.t('navigation')} />
          ),
        }}
        name='PreferencesNavigation'
        component={PreferencesNavigationScreen}
      />
      <RootStack.Screen
        options={{
          header: () => (
            <Header buttonType='back' title={i18n.t('homeScreen')} />
          ),
        }}
        name='PreferencesHomeScreen'
        component={PreferencesHomeScreen}
      />
      <RootStack.Screen
        options={{
          header: () => <Header buttonType='back' title={i18n.t('backups')} />,
        }}
        name='PreferencesBackups'
        component={PreferencesBackupsScreen}
      />
      <RootStack.Screen
        options={{
          header: () => (
            <Header buttonType='back' title={i18n.t('appearance')} />
          ),
        }}
        name='PreferencesAppearance'
        component={PreferencesAppearanceScreen}
      />
      <RootStack.Screen
        options={{
          header: () => (
            <Header buttonType='back' title={i18n.t('planSchedule')} noInsets />
          ),
          presentation: 'modal',
        }}
        name='PlanSchedule'
        component={PlanScheduleScreen}
      />
      <RootStack.Screen
        options={({ route }) => {
          const params = route.params as RootStackParamList['PlanDay']
          let title = i18n.t('createPlan')

          if (params?.existingDayPlanId) {
            title = `${i18n.t('editPlan')} • ${i18n.t('oneTime')}`
          } else if (params?.existingRecurringPlanId) {
            if (params?.recurringPlanDate) {
              // This is an override scenario - we'd need to check if override exists
              // For simplicity, we'll show "Edit Plan" since the screen will determine create vs edit override
              title = `${i18n.t('editPlan')} • ${i18n.t('override')}`
            } else {
              title = `${i18n.t('editPlan')} • ${i18n.t('recurring')}`
            }
          }

          return {
            header: () => <Header buttonType='back' title={title} noInsets />,
            presentation: 'modal',
          }
        }}
        name='PlanDay'
        component={PlanDayScreen}
      />
    </RootStack.Navigator>
  )
}

export default RootStackComponent
