import { createNativeStackNavigator } from '@react-navigation/native-stack'
import ContactFormScreen from '@/features/contacts/screens/ContactFormScreen'
import Header from '@/components/ui/layout/Header'
import VisitFormRoute from '@/app/visits/VisitFormRoute'
import ContactDetailsScreen from '@/features/contacts/screens/ContactDetailsScreen'
import AddTimeScreen from '@/features/service-reports/screens/AddTimeScreen'
import RecoverContactsScreen from '@/features/contacts/screens/RecoverContactsScreen'
import DismissedContactsScreen from '@/features/contacts/screens/DismissedContactsScreen'
import ContactsSortAndFilterScreen from '@/features/contacts/screens/ContactsSortAndFilterScreen'
import OnBoarding from '@/features/onboarding/components/Onboarding'
import { usePreferences } from '@/stores/preferences'
import UpdateScreen from '@/features/updates/screens/UpdateScreen'
import HomeTabStack from '@/app/navigation/HomeTabStack'
import i18n from '@/lib/locales'
import PaywallRouteScreen from '@/app/navigation/PaywallRouteScreen'
import PaywallThankYouScreen from '@/features/supporter/screens/PaywallThankYouScreen'
import RescheduleVisitScreen from '@/features/visits/screens/RescheduleVisitScreen'
import PlanDayScreen from '@/features/plans/screens/PlanDayScreen'
import RolloverScreen from '@/features/service-reports/screens/RolloverScreen'
import MilestoneShowcaseScreen from '@/features/milestones/screens/MilestoneShowcaseScreen'
import ServiceReportViewScreen from '@/features/service-reports/screens/ServiceReportViewScreen'
import OnboardingBackfillScreen from '@/features/service-reports/screens/OnboardingBackfillScreen'
import ServiceHistoryScreen from '@/features/service-reports/screens/ServiceHistoryScreen'
import BuddyCodeScreen from '@/features/buddies/screens/BuddyCodeScreen'
import BuddyDetailScreen from '@/features/buddies/screens/BuddyDetailScreen'
import BuddyInviteScreen from '@/features/buddies/screens/BuddyInviteScreen'
import BuddiesSettingsScreen from '@/features/buddies/screens/BuddiesSettingsScreen'
import { settingsDetailScreens } from '@/app/navigation/settingsDetailScreens'
import { RootStackParamList } from '@/types/rootStack'

const RootStack = createNativeStackNavigator<RootStackParamList>()

const RootStackComponent = () => {
  const { onboardingComplete } = usePreferences()

  return (
    <RootStack.Navigator>
      <RootStack.Group
        navigationKey={onboardingComplete ? 'app' : 'onboarding'}
      >
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
        <RootStack.Screen name='Visit Form' component={VisitFormRoute} />
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
          // Native iOS form sheet — handles drag-to-dismiss + inner ScrollView
          // gestures correctly, which the previous Tamagui sheet did not.
          options={{
            presentation: 'modal',
            sheetAllowedDetents: [1],
            sheetGrabberVisible: true,
            sheetCornerRadius: 18,
            headerShown: false,
          }}
          name='Contacts Sort And Filter'
          component={ContactsSortAndFilterScreen}
        />
        <RootStack.Screen
          options={{ header: () => null }}
          name='Update'
          component={UpdateScreen}
        />
        {settingsDetailScreens.map((screen) => (
          <RootStack.Screen
            key={screen.name}
            name={screen.name}
            component={screen.component}
            options={{
              header: () => (
                <Header
                  buttonType='back'
                  title={screen.title()}
                  rightElement={screen.headerRight && <screen.headerRight />}
                />
              ),
            }}
          />
        ))}
        <RootStack.Screen
          options={{
            header: () => <Header buttonType='back' title={i18n.t('donate')} />,
          }}
          name='Paywall'
          component={PaywallRouteScreen}
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
            presentation: 'modal',
            header: () => (
              <Header noInsets buttonType='back' title={i18n.t('reschedule')} />
            ),
          }}
          name='RescheduleVisit'
          component={RescheduleVisitScreen}
        />
        <RootStack.Screen
          options={({ route }) => {
            const params = route.params as RootStackParamList['PlanDay']
            let title = i18n.t('createPlan')

            if (params?.existingDayPlanId || params?.existingRecurringPlanId) {
              title = i18n.t('editPlan')
            }

            return {
              header: () => <Header buttonType='back' title={title} noInsets />,
              presentation: 'modal',
            }
          }}
          name='PlanDay'
          component={PlanDayScreen}
        />
        <RootStack.Screen
          options={{
            presentation: 'fullScreenModal',
            gestureEnabled: false,
            header: () => null,
          }}
          name='Rollover'
          component={RolloverScreen}
        />
        <RootStack.Screen
          options={{
            presentation: 'modal',
            header: () => null,
          }}
          name='MilestoneShowcase'
          component={MilestoneShowcaseScreen}
        />
        <RootStack.Screen
          options={{
            presentation: 'modal',
            header: () => null,
          }}
          name='ServiceReportView'
          component={ServiceReportViewScreen}
        />
        <RootStack.Screen
          options={{
            header: () => (
              <Header
                buttonType='back'
                title={i18n.t('onboardingBackfillScreenHeader')}
              />
            ),
          }}
          name='OnboardingBackfill'
          component={OnboardingBackfillScreen}
        />
        <RootStack.Screen
          options={{
            header: () => (
              <Header
                buttonType='back'
                title={i18n.t('serviceHistory.title')}
              />
            ),
          }}
          name='ServiceHistory'
          component={ServiceHistoryScreen}
        />
        <RootStack.Screen
          options={{
            header: () => (
              <Header buttonType='back' title={i18n.t('buddies_title')} />
            ),
          }}
          name='Buddy'
          component={BuddyDetailScreen}
        />
        <RootStack.Screen
          options={{
            presentation: 'modal',
            header: () => (
              <Header
                noInsets
                buttonType='exit'
                title={i18n.t('buddies_codeTitle')}
              />
            ),
          }}
          name='Buddy Code'
          component={BuddyCodeScreen}
        />
        <RootStack.Screen
          options={{
            presentation: 'modal',
            header: () => (
              <Header
                noInsets
                buttonType='back'
                title={i18n.t('buddies_title')}
              />
            ),
          }}
          name='Buddy Invite'
          component={BuddyInviteScreen}
        />
        <RootStack.Screen
          options={{
            header: () => (
              <Header
                buttonType='back'
                title={i18n.t('buddies_settingsTitle')}
              />
            ),
          }}
          name='Buddies Settings'
          component={BuddiesSettingsScreen}
        />
      </RootStack.Group>
    </RootStack.Navigator>
  )
}

export default RootStackComponent
