import React, { PropsWithChildren, ReactNode } from "react";
import { View } from "react-native";
import theme from "../../constants/theme";
import { rowPaddingVertical } from "../../constants/Inputs";
import MyText from "../MyText";

interface Props {
  children?: ReactNode;
  lastInSection?: boolean;
  noHorizontalPadding?: boolean;
  label?: string;
}

const InputRowContainer: React.FC<PropsWithChildren<Props>> = ({
  children,
  lastInSection,
  noHorizontalPadding,
  label,
}: Props) => {
  return (
    <View
      style={{
        flexDirection: "row",
        borderColor: theme.colors.border,
        borderBottomWidth: lastInSection ? 0 : 1,
        paddingBottom: lastInSection ? 0 : rowPaddingVertical,
        paddingRight: noHorizontalPadding ? 0 : 20,
        alignItems: "center",
        flexGrow: 1,
        gap: 15,
      }}
    >
      <MyText style={{ fontWeight: "600", flexDirection: "column" }}>
        {label}
      </MyText>
      {children}
    </View>
  );
};

export default InputRowContainer;
