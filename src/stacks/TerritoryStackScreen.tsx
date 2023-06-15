import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PropsWithChildren } from 'react';

import TerritoryScreen from '../screens/TerritoryScreen';

interface TerritoryStackScreenProps {}

export type TerritoryStackParamList = {
  Home: undefined;
};

const TerritoryStackScreen: React.FC<
  PropsWithChildren<TerritoryStackScreenProps>
> = () => {
  const TerritoryStack = createNativeStackNavigator<TerritoryStackParamList>();
  return (
    <TerritoryStack.Navigator
      initialRouteName="Home"
      screenOptions={() => ({
        headerShown: false,
      })}>
      <TerritoryStack.Screen name="Home" component={TerritoryScreen} />
    </TerritoryStack.Navigator>
  );
};

export default TerritoryStackScreen;
