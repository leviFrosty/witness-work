import { Platform } from 'react-native'
import { useDisplayRegions } from '@/stores/displayRegions'
import { petOpensAsSheet } from '@/features/pet/lib/petPresentation'
import createSystemBackStackNavigator from '@/app/navigation/createSystemBackStackNavigator'
import Header from '@/components/ui/layout/Header'
import useTheme from '@/contexts/theme'
import HorizontalSafeArea from '@/components/ui/layout/HorizontalSafeArea'
import { usePreferences } from '@/stores/preferences'
import HomeTabStack from '@/app/navigation/HomeTabStack'
import i18n from '@/lib/locales'
import { settingsDetailScreens } from '@/app/navigation/settingsDetailScreens'
import { RootStackParamList } from '@/types/rootStack'

// Pushed screens get the system's Back button in iPhone Duo's vertical bar.
const RootStack = createSystemBackStackNavigator<RootStackParamList>()

/**
 * The pet's details and the Shop: a large sheet where the window is compact,
 * full screen where it's regular width or on Android.
 */
const petLargeScreenOptions = () =>
  petOpensAsSheet()
    ? {
        presentation: 'formSheet' as const,
        sheetAllowedDetents: [1],
        sheetGrabberVisible: true,
        sheetCornerRadius: 18,
        headerShown: false,
      }
    : {
        presentation:
          Platform.OS === 'ios'
            ? ('fullScreenModal' as const)
            : ('modal' as const),
        headerShown: false,
      }

const RootStackComponent = () => {
  const onboardingComplete = usePreferences((s) => s.onboardingComplete)
  const theme = useTheme()

  return (
    <RootStack.Navigator
      // The tabs keep their own; the badge viewer places its coin in window
      // coordinates. A form sheet keeps its own color in the insets, and its
      // wrapper has to stay a layout-only view: a filled one is a real native
      // view, so react-native-screens can't find the sheet's scroll view to
      // size it, and a full-height sheet opens blank on iPhone Duo.
      screenLayout={({ route, options, children }) =>
        route.name === 'Root' || route.name === 'BadgeView' ? (
          children
        ) : (
          <HorizontalSafeArea
            backgroundColor={
              options.presentation === 'transparentModal' ||
              options.presentation === 'containedTransparentModal' ||
              options.presentation === 'formSheet'
                ? undefined
                : theme.colors.background
            }
          >
            {children}
          </HorizontalSafeArea>
        )
      }
    >
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
          // Full screen everywhere (iPad too), so the keyboard-pinned toolbar
          // measures from the window's bottom edge.
          options={{
            presentation: 'fullScreenModal',
            headerShown: false,
            gestureEnabled: false,
          }}
          name='NoteEditor'
          getComponent={() => require('@/app/notes/NoteEditorScreen').default}
        />
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
          // A sheet on iPhone (full screen on Android); a form sheet in a
          // regular-width window (iPad, iPhone Duo open), so it isn't a
          // phone-height list stretched across the screen.
          options={() => {
            const regions = useDisplayRegions.getState().regions
            const formSheet =
              Platform.OS === 'ios' &&
              (regions
                ? regions.horizontalSizeClass === 'regular'
                : Platform.isPad)
            return {
              presentation: formSheet ? 'formSheet' : 'modal',
              headerShown: false,
            }
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
          // Draws its own header, which holds the usage ring and History.
          options={{ header: () => null }}
          name='ScribeConversation'
          getComponent={() =>
            require('@/app/navigation/ScribeConversationRouteScreen').default
          }
        />
        <RootStack.Screen
          // A sheet drawn over the screen it opened from.
          options={{
            presentation: 'transparentModal',
            animation: 'fade',
            headerShown: false,
          }}
          name='ScribeVoice'
          getComponent={() =>
            require('@/features/scribe/screens/ScribeVoiceScreen').default
          }
        />
        <RootStack.Screen
          options={{
            presentation: 'transparentModal',
            animation: 'fade',
            headerShown: false,
          }}
          name='ScribeOffline'
          getComponent={() =>
            require('@/features/scribe/screens/ScribeOfflineSheet').default
          }
        />
        <RootStack.Screen
          options={{
            presentation: 'transparentModal',
            animation: 'fade',
            headerShown: false,
          }}
          name='ScribeConsent'
          getComponent={() =>
            require('@/features/scribe/screens/ScribeConsentSheet').default
          }
        />
        <RootStack.Screen
          options={{
            header: () => (
              <Header buttonType='back' title={i18n.t('scribe_historyTitle')} />
            ),
          }}
          name='ScribeHistory'
          getComponent={() =>
            require('@/features/scribe/screens/ScribeHistoryScreen').default
          }
        />
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
          // A sheet, so a Visit opens over wherever it's listed. Edit and the
          // other forms stack over it and return here when saved.
          options={{ presentation: 'modal', header: () => null }}
          name='Visit Details'
          getComponent={() => require('@/app/visits/VisitDetailsRoute').default}
        />
        <RootStack.Screen
          options={{ presentation: 'modal', header: () => null }}
          name='Follow-Up Invitation'
          getComponent={() =>
            require('@/features/buddies/screens/FollowUpInvitationScreen')
              .default
          }
        />
        <RootStack.Screen
          // A sheet over the invitation it lists, like the invitation itself.
          options={{ presentation: 'modal', header: () => null }}
          name='Going List'
          getComponent={() =>
            require('@/features/buddies/screens/GoingListScreen').default
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
            header: () => (
              <Header buttonType='back' title={i18n.t('routeBuilder_title')} />
            ),
          }}
          name='TodayRoute'
          getComponent={() =>
            require('@/app/route-planning/RouteBuilderRouteScreen').default
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
            require('@/app/navigation/SettingsMenuScreen').default
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
          // A sheet sized to the picker on iOS (a centered form sheet on iPad);
          // full screen on Android. Pulling it down cancels.
          options={
            Platform.OS === 'ios'
              ? {
                  presentation: 'formSheet',
                  sheetAllowedDetents: 'fitToContents',
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 18,
                  headerShown: false,
                }
              : { presentation: 'modal', headerShown: false }
          }
          name='PetPicker'
          getComponent={() =>
            require('@/features/pet/screens/PetPickerScreen').default
          }
        />
        <RootStack.Screen
          // The pet's details: a large sheet on iPhone with its name, the room
          // on top and its hat and parts scrolling below; full screen where
          // the window is regular width (iPad, iPhone Duo open), the room
          // beside the items, like the Shop. Full screen on Android. Choices
          // save as they're made.
          options={petLargeScreenOptions}
          name='PetRoom'
          getComponent={() => require('@/app/pet/PetRoomRoute').default}
        />
        <RootStack.Screen
          // The Shop, over the pet's details: a large sheet on iPhone, full
          // screen where the window is regular width (iPad, iPhone Duo open)
          // so the room and the items sit side by side. Full screen on
          // Android.
          options={petLargeScreenOptions}
          name='PetShop'
          getComponent={() =>
            require('@/features/pet/screens/PetShopScreen').default
          }
        />
        <RootStack.Screen
          // Sized to its one field on iOS, like the picker.
          options={
            Platform.OS === 'ios'
              ? {
                  presentation: 'formSheet',
                  sheetAllowedDetents: 'fitToContents',
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 18,
                  headerShown: false,
                }
              : { presentation: 'modal', headerShown: false }
          }
          name='PetRename'
          getComponent={() =>
            require('@/features/pet/screens/PetRenameScreen').default
          }
        />
        <RootStack.Screen
          // A large sheet over the details on iOS, its sections scrolling;
          // full screen on Android.
          options={
            Platform.OS === 'ios'
              ? {
                  presentation: 'formSheet',
                  sheetAllowedDetents: [1],
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 18,
                  headerShown: false,
                }
              : { presentation: 'modal', headerShown: false }
          }
          name='PetSettings'
          getComponent={() => require('@/app/pet/PetSettingsScreen').default}
        />
        <RootStack.Screen
          // Every visiting pet: a large sheet like the details, so a long list
          // scrolls. Full screen on Android.
          options={
            Platform.OS === 'ios'
              ? {
                  presentation: 'formSheet',
                  sheetAllowedDetents: [1],
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 18,
                  headerShown: false,
                }
              : { presentation: 'modal', headerShown: false }
          }
          name='PetVisits'
          getComponent={() => require('@/app/pet/PetVisitsRoute').default}
        />
        <RootStack.Screen
          // The share card, sized to it on iOS like the picker; full screen
          // on Android. Pulling it down closes it.
          options={
            Platform.OS === 'ios'
              ? {
                  presentation: 'formSheet',
                  sheetAllowedDetents: 'fitToContents',
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 18,
                  headerShown: false,
                }
              : { presentation: 'modal', headerShown: false }
          }
          name='PetShare'
          getComponent={() =>
            require('@/features/pet/screens/PetShareScreen').default
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
          name='BuddyBadges'
          getComponent={() =>
            require('@/app/badges/BuddyBadgesRouteScreen').default
          }
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
