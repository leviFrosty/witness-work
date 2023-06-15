import React from 'react';
import { StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export const MaterialCommunityIconsPack = {
  name: 'materialCommunity',
  icons: createIconsMap(),
};

function createIconsMap() {
  return new Proxy(
    {},
    {
      get(_, name) {
        return IconProvider(name);
      },
    },
  );
}

const IconProvider = (name: string | symbol) => ({
  toReactElement: (props: any) => MaterialCommunityIcon({ name, ...props }),
});

function MaterialCommunityIcon({ name, style }: { name: string; style: any }) {
  const { height, tintColor, ...iconStyle } = StyleSheet.flatten(style);
  return <Icon name={name} size={height} color={tintColor} style={iconStyle} />;
}
