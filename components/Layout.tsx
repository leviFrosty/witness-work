import React, { PropsWithChildren } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View } from "react-native";
import theme from "../lib/theme";

interface LayoutProps {
  removeContentPadding?: boolean;
}

const Layout: React.FC<PropsWithChildren<LayoutProps>> = ({
  children,
  removeContentPadding,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        // Paddings to handle safe area
        paddingTop: removeContentPadding
          ? insets.top
          : insets.top + theme.contentPaddingTop,
        paddingLeft: removeContentPadding
          ? insets.left
          : insets.left + theme.contentPaddingLeftRight,
        paddingRight: removeContentPadding
          ? insets.right
          : insets.right + theme.contentPaddingLeftRight,
      }}
    >
      {children}
    </View>
  );
};

export default Layout;
