import React, { PropsWithChildren, ReactNode } from "react";
import { GestureResponderEvent, ViewStyle, View } from "react-native";
import useTheme from "../../contexts/theme";
import { rowPaddingVertical } from "../../constants/Inputs";
import Text from "../MyText";
import Button from "../Button";
import IconButton from "../IconButton";
import { IconProp } from "@fortawesome/fontawesome-svg-core";

interface Props {
  children?: ReactNode;
  lastInSection?: boolean;
  noHorizontalPadding?: boolean;
  label?: string;
  leftIcon?: IconProp;
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
  const theme = useTheme();

  return (
    <Button
      noTransform
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
    >
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        {leftIcon && <IconButton icon={leftIcon} />}
        <Text
          style={{ fontFamily: theme.fonts.semiBold, flexDirection: "column" }}
        >
          {label}
        </Text>
      </View>
      {children}
    </Button>
  );
};

export default InputRowButton;
