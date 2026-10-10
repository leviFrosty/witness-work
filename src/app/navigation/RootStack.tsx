import { Platform } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import Header from '@/components/ui/layout/Header'
import { usePreferences } from '@/stores/preferences'
import HomeTabStack from '@/app/navigation/HomeTabStack'
import i18n from '@/lib/locales'
import { settingsDetailScreens } from '@/app/navigation/settingsDetailScreens'
import { RootStackParamList } from '@/types/rootStack'

const RootStack = createNativeStackNavigator<RootStackParamList>()

const RootStackComponent = () => {
  const onboardingComplete = usePreferences((s) => s.onboardingComplete)

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
            getComponent={() =>
              require('@/features/onboarding/components/Onboarding').default
            }
          />
        )}
        <RootStack.Screen
          name='Contact Details'
          getComponent={() =>
            require('@/features/contacts/screens/ContactDetailsScreen').default
          }
        />
        <RootStack.Screen
          name='Contact Form'
          getComponent={() =>
            require('@/features/contacts/screens/ContactFormScreen').default
          }
        />
        <RootStack.Screen
          name='Visit Form'
          getComponent={() => require('@/app/visits/VisitFormRoute').default}
        />
        <RootStack.Screen
          name='Add Time'
          options={{
            header: () => (
              <Header noInsets buttonType='back' title={i18n.t('addTime')} />
            ),
          }}
          getComponent={() =>
            require('@/features/service-reports/screens/AddTimeScreen').default
          }
        />
        <RootStack.Screen
          options={{
            presentation: 'modal',
            header: () => <Header noInsets buttonType='back' title='' />,
          }}
          name='Recover Contacts'
          getComponent={() =>
            require('@/features/contacts/screens/RecoverContactsScreen').default
          }
        />
        <RootStack.Screen
          options={{
            header: () => (
              <Header buttonType='back' title={i18n.t('dismissedContacts')} />
            ),
          }}
          name='Dismissed Contacts'
          getComponent={() =>
            require('@/features/contacts/screens/DismissedContactsScreen')
              .default
          }
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
          getComponent={() =>
            require('@/features/contacts/screens/ContactsSortAndFilterScreen')
              .default
          }
        />
        <RootStack.Screen
          // A sheet on iPhone (full screen on Android); a form sheet on iPad, so
          // it isn't a phone-height list stretched across the screen.
          options={{
            presentation:
              Platform.OS === 'ios' && Platform.isPad ? 'formSheet' : 'modal',
            headerShown: false,
          }}
          name='Log Visit'
          getComponent={() =>
            require('@/features/log-visit/screens/LogVisitScreen').default
          }
        />
        <RootStack.Screen
          options={{
            header: () => (
              <Header
                buttonType='back'
                title={i18n.t('savedViews_screenTitle')}
              />
            ),
          }}
          name='Saved Contact Views'
          getComponent={() =>
            require('@/features/contacts/screens/SavedViewsScreen').default
          }
        />
        <RootStack.Screen
          options={{ header: () => null }}
          name='Update'
          getComponent={() =>
            require('@/features/updates/screens/UpdateScreen').default
          }
        />
        {settingsDetailScreens.map((screen) => (
          <RootStack.Screen
            key={screen.name}
            name={screen.name}
            getComponent={screen.getComponent}
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
          getComponent={() =>
            require('@/app/navigation/PaywallRouteScreen').default
          }
        />
        <RootStack.Screen
          options={{
            header: () => null,
          }}
          name='Thank You'
          getComponent={() =>
            require('@/features/supporter/screens/PaywallThankYouScreen')
              .default
          }
        />
        <RootStack.Screen
          options={{
            presentation: 'modal',
            header: () => (
              <Header noInsets buttonType='back' title={i18n.t('reschedule')} />
            ),
          }}
          name='RescheduleVisit'
          getComponent={() =>
            require('@/features/visits/screens/RescheduleVisitScreen').default
          }
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
          getComponent={() =>
            require('@/features/plans/screens/PlanDayScreen').default
          }
        />
        <RootStack.Screen
          options={{ header: () => null }}
          name='Plan Details'
          getComponent={() =>
            require('@/features/plans/screens/PlanDetailsScreen').default
          }
        />
        <RootStack.Screen
          options={{
            presentation: 'modal',
            header: () => (
              <Header
                noInsets
                buttonType='back'
                title={i18n.t('routePlan_title')}
              />
            ),
          }}
          name='TodayRoute'
          getComponent={() =>
            require('@/features/route-planning/screens/TodayRouteScreen')
              .default
          }
        />
        <RootStack.Screen
          options={{
            presentation: 'fullScreenModal',
            gestureEnabled: false,
            header: () => null,
          }}
          name='Rollover'
          getComponent={() =>
            require('@/features/service-reports/screens/RolloverScreen').default
          }
        />
        <RootStack.Screen
          options={{
            presentation: 'modal',
            header: () => null,
          }}
          name='MilestoneShowcase'
          getComponent={() =>
            require('@/features/milestones/screens/MilestoneShowcaseScreen')
              .default
          }
        />
        <RootStack.Screen
          options={{
            presentation: 'modal',
            header: () => null,
          }}
          name='ServiceReportView'
          getComponent={() =>
            require('@/features/service-reports/screens/ServiceReportViewScreen')
              .default
          }
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
          getComponent={() =>
            require('@/features/service-reports/screens/OnboardingBackfillScreen')
              .default
          }
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
          getComponent={() =>
            require('@/features/service-reports/screens/ServiceHistoryScreen')
              .default
          }
        />
        <RootStack.Screen
          options={{
            header: () => <Header buttonType='back' noBottomBorder />,
          }}
          name='SettingsMenu'
          getComponent={() =>
            require('@/features/settings/screens/SettingsScreen').default
          }
        />
        <RootStack.Screen
          options={{
            header: () => (
              <Header buttonType='back' title={i18n.t('buddies_title')} />
            ),
          }}
          name='Buddies'
          getComponent={() =>
            require('@/app/buddies/BuddiesRouteScreen').default
          }
        />
        <RootStack.Screen
          options={{
            header: () => (
              <Header buttonType='back' title={i18n.t('buddies_title')} />
            ),
          }}
          name='Buddy'
          getComponent={() =>
            require('@/features/buddies/screens/BuddyDetailScreen').default
          }
        />
        <RootStack.Screen
          options={{
            presentation: 'modal',
            // Dismiss back to Buddies; `exit` pops to the root tabs.
            header: ({ navigation }) => (
              <Header
                noInsets
                buttonType='exit'
                onPressLeftIcon={() => navigation.goBack()}
                title={i18n.t('buddies_codeTitle')}
              />
            ),
          }}
          name='Buddy Code'
          getComponent={() =>
            require('@/features/buddies/screens/BuddyCodeScreen').default
          }
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
          getComponent={() =>
            require('@/features/buddies/screens/BuddyInviteScreen').default
          }
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
          getComponent={() =>
            require('@/features/buddies/screens/BuddiesSettingsScreen').default
          }
        />
        <RootStack.Screen
          options={{
            presentation: 'modal',
            // Dismiss back to Buddies; `exit` pops to the root tabs.
            header: ({ navigation }) => (
              <Header
                noInsets
                buttonType='exit'
                onPressLeftIcon={() => navigation.goBack()}
                title={i18n.t('buddies_feedbackTitle')}
              />
            ),
          }}
          name='Buddies Feedback'
          getComponent={() =>
            require('@/features/buddies/screens/BuddiesFeedbackScreen').default
          }
        />
        <RootStack.Screen
          options={{ header: () => null }}
          name='Mileage'
          getComponent={() =>
            require('@/features/mileage/screens/MileageScreen').default
          }
        />
        <RootStack.Screen
          options={({ route }) => ({
            presentation: 'modal',
            header: () => (
              <Header
                noInsets
                buttonType='back'
                title={i18n.t(
                  route.params?.tripId ? 'mileage.editTrip' : 'mileage.logTrip'
                )}
              />
            ),
          })}
          name='MileageTripForm'
          getComponent={() =>
            require('@/features/mileage/screens/MileageTripFormScreen').default
          }
        />
        <RootStack.Screen
          options={{ header: () => null }}
          name='MileageTripDetails'
          getComponent={() =>
            require('@/features/mileage/screens/MileageTripDetailsScreen')
              .default
          }
        />
        <RootStack.Screen
          options={{
            header: () => (
              <Header buttonType='back' title={i18n.t('mileage.settings')} />
            ),
          }}
          name='MileageSettings'
          getComponent={() =>
            require('@/features/mileage/screens/MileageSettingsScreen').default
          }
        />
        <RootStack.Screen
          options={({ route }) => ({
            presentation: 'modal',
            header: () => (
              <Header
                noInsets
                buttonType='back'
                title={i18n.t(
                  route.params?.vehicleId ? 'mileage.editCar' : 'mileage.addCar'
                )}
              />
            ),
          })}
          name='MileageVehicleForm'
          getComponent={() =>
            require('@/features/mileage/screens/MileageVehicleFormScreen')
              .default
          }
        />
        <RootStack.Screen
          options={({ route }) => ({
            presentation: 'modal',
            header: () => (
              <Header
                noInsets
                buttonType='back'
                title={i18n.t(
                  route.params?.fuelId ? 'mileage.editFuel' : 'mileage.addFuel'
                )}
              />
            ),
          })}
          name='MileageFuelForm'
          getComponent={() =>
            require('@/features/mileage/screens/MileageFuelFormScreen').default
          }
        />
        <RootStack.Screen
          options={{
            header: () => (
              <Header buttonType='back' title={i18n.t('badges_title')} />
            ),
          }}
          name='Badges'
          getComponent={() => require('@/app/badges/BadgesRouteScreen').default}
        />
        <RootStack.Screen
          // Over everything, transparent, and unanimated: the screen grows
          // the coin out of the tapped medallion and plays its own close.
          options={{
            presentation: 'transparentModal',
            animation: 'none',
            headerShown: false,
            gestureEnabled: false,
            contentStyle: { backgroundColor: 'transparent' },
          }}
          name='BadgeView'
          getComponent={() =>
            require('@/app/badges/BadgeViewRouteScreen').default
          }
        />
      </RootStack.Group>
    </RootStack.Navigator>
  )
}

export default RootStackComponent
