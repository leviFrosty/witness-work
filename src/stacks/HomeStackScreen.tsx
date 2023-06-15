import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PropsWithChildren } from 'react';

import { HomeStackParamList } from './ParamLists';
import AnnualReportScreen from '../screens/AnnualReportScreen';
import CallDetailsScreen from '../screens/CallDetailsScreen';
import CallFormScreen from '../screens/CallFormScreen';
import DashboardScreen from '../screens/DashboardScreen';
import ServiceRecordFormScreen from '../screens/ServiceRecordFormScreen';
import SettingsScreen from '../screens/SettingsScreen';
import VisitFormScreen from '../screens/VisitFormScreen';

interface HomeStackScreenProps {}

const HomeStackScreen: React.FC<
  PropsWithChildren<HomeStackScreenProps>
> = () => {
  const HomeStack = createNativeStackNavigator<HomeStackParamList>();
  return (
    <HomeStack.Navigator
      initialRouteName="Dashboard"
      screenOptions={{
        headerShown: false,
      }}>
      <HomeStack.Screen name="Dashboard" component={DashboardScreen} />
      <HomeStack.Screen name="Settings" component={SettingsScreen} />
      <HomeStack.Screen
        name="VisitForm"
        component={VisitFormScreen}
        options={{
          presentation: 'fullScreenModal',
          gestureEnabled: false,
        }}
      />
      <HomeStack.Screen
        name="CallDetails"
        component={CallDetailsScreen}
        options={{
          presentation: 'modal',
        }}
      />
      <HomeStack.Screen
        name="CallForm"
        component={CallFormScreen}
        options={{
          presentation: 'fullScreenModal',
        }}
      />
      <HomeStack.Screen
        name="ServiceRecordForm"
        component={ServiceRecordFormScreen}
        options={{
          presentation: 'modal',
        }}
      />
      <HomeStack.Screen
        name="AnnualReport"
        component={AnnualReportScreen}
        options={({
          route: {
            params: { previouslyViewedYear },
          },
        }) => {
          if (!previouslyViewedYear) {
            return {
              animation: 'default',
            };
          }
          return {
            animation: 'fade',
          };
        }}
      />
    </HomeStack.Navigator>
  );
};

export default HomeStackScreen;
