import React, { PropsWithChildren, ReactNode } from "react";
import {
  GestureResponderEvent,
  TouchableOpacity,
  ViewStyle,
  View,
} from "react-native";
import theme from "../../constants/theme";
import { rowPaddingVertical } from "../../constants/Inputs";
import Text from "../MyText";
import { FontAwesome5 } from "@expo/vector-icons";

interface Props {
  children?: ReactNode;
  lastInSection?: boolean;
  noHorizontalPadding?: boolean;
  label?: string;
  leftIcon?: string;
  justifyContent?:
    | "flex-start"
    | "flex-end"
    | "center"
    | "space-between"
    | "space-around"
    | "space-evenly"
    | undefined;
  onPress?: ((event: GestureResponderEvent) => void) | undefined;
  style?: ViewStyle;
}

const InputRowButton: React.FC<PropsWithChildren<Props>> = ({
  children,
  lastInSection,
  noHorizontalPadding,
  label,
  justifyContent,
  onPress,
  style,
  leftIcon,
}: Props) => {
  return (
    <TouchableOpacity
      style={{
        flexDirection: "row",
        borderColor: theme.colors.border,
        borderBottomWidth: lastInSection ? 0 : 1,
        paddingBottom: lastInSection ? 0 : rowPaddingVertical,
        paddingRight: noHorizontalPadding ? 0 : 20,
        alignItems: "center",
        flexGrow: 1,
        justifyContent: justifyContent ?? "space-between",
        gap: 15,
        ...style,
      }}
      onPress={onPress}
      hitSlop={20}
    >
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        {leftIcon && (
          <FontAwesome5
            name={leftIcon}
            style={{ color: theme.colors.textAlt }}
          />
        )}
        <Text
          style={{ fontFamily: "Inter_600SemiBold", flexDirection: "column" }}
        >
          {label}
        </Text>
      </View>
      {children}
    </TouchableOpacity>
  );
};

export default InputRowButton;
