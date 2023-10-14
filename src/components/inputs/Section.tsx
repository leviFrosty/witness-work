import { PropsWithChildren, ReactNode } from "react";
import { View } from "react-native";
import theme from "../../constants/theme";
import { rowPaddingVertical } from "../../constants/Inputs";

interface Props {}

const Section: React.FC<PropsWithChildren<Props>> = ({ children }) => {
  return (
    <View
      style={{
        borderColor: theme.colors.border,
        borderTopWidth: 2,
        borderBottomWidth: 2,
        backgroundColor: theme.colors.backgroundLighter,
        paddingVertical: rowPaddingVertical,
        paddingLeft: 25,
        gap: 10,
      }}
    >
      {children}
    </View>
  );
};

export default Section;
