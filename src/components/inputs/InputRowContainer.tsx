import React, { PropsWithChildren, ReactNode } from "react";
import { View } from "react-native";
import useTheme from "../../contexts/theme";
import { rowPaddingVertical } from "../../constants/Inputs";
import Text from "../MyText";
import { FontAwesome5 } from "@expo/vector-icons";

interface Props {
  children?: ReactNode;
  leftIcon?: string;
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
  gap?: number;
}

const InputRowContainer: React.FC<PropsWithChildren<Props>> = ({
  children,
  leftIcon,
  lastInSection,
  noHorizontalPadding,
  label,
  justifyContent,
  gap,
}: Props) => {
  const theme = useTheme();

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
        gap: gap || 15,
      }}
    >
      {(leftIcon || label) && (
        <View style={{ alignItems: "center", gap: 5, flexDirection: "row" }}>
          {leftIcon && (
            <FontAwesome5
              name={leftIcon}
              style={{ color: theme.colors.textAlt }}
            />
          )}
          {label && (
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {label}
            </Text>
          )}
        </View>
      )}
      {children}
    </View>
  );
};

export default InputRowContainer;
