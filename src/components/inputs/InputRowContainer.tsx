import React, { PropsWithChildren, ReactNode } from "react";
import { View } from "react-native";
import theme from "../../constants/theme";
import { rowPaddingVertical } from "../../constants/Inputs";
import Text from "../MyText";

interface Props {
  children?: ReactNode;
  lastInSection?: boolean;
  noHorizontalPadding?: boolean;
  label?: string;
  justifyContent?:
    | "flex-start"
    | "flex-end"
    | "center"
    | "space-between"
    | "space-around"
    | "space-evenly"
    | undefined;
}

const InputRowContainer: React.FC<PropsWithChildren<Props>> = ({
  children,
  lastInSection,
  noHorizontalPadding,
  label,
  justifyContent,
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
        justifyContent,
        gap: 15,
      }}
    >
      <Text
        style={{ fontFamily: "Inter_600SemiBold", flexDirection: "column" }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
};

export default InputRowContainer;
