import {
  View,
  GestureResponderEvent,
  TextProps,
  Pressable,
  ViewProps,
} from "react-native";
import Haptics from "../lib/haptics";
import * as Clipboard from "expo-clipboard";
import { PropsWithChildren, useContext, useState } from "react";
import Text from "./MyText";
import Animated, {
  Easing,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import i18n from "../lib/locales";
import { ThemeContext } from "../contexts/theme";
import IconButton from "./IconButton";
import { faCaretDown } from "@fortawesome/free-solid-svg-icons";

const AnimatedView = Animated.createAnimatedComponent(View);

interface Props extends ViewProps {
  textProps?: TextProps;
  text?: string;
  onPress?: (event: GestureResponderEvent) => void;
}

const Copyeable: React.FC<PropsWithChildren<Props>> = ({
  children,
  textProps,
  text,
  onPress,
  ...props
}) => {
  const theme = useContext(ThemeContext);
  const [showOverlay, setShowOverlay] = useState(false);
  const opacity = useSharedValue(0);

  const handleLongPress = async (event: GestureResponderEvent) => {
    Haptics.success();
    if (text || typeof children === "string") {
      setShowOverlay(true);
      opacity.value = withTiming(1, {
        duration: 150,
        easing: Easing.in(Easing.quad),
      });
      await Clipboard.setStringAsync(text || (children as string)).then(() => {
        setTimeout(() => {
          opacity.value = withTiming(0, {
            duration: 150,
            easing: Easing.out(Easing.quad),
          });
        }, 1300);
        setTimeout(() => {
          setShowOverlay(false);
        }, 1500);
      });
    }
    textProps?.onLongPress?.(event);
  };
  return (
    <View
      style={[
        [
          {
            position: "relative",
          },
        ],
        [props.style],
      ]}
      {...props}
    >
      {typeof children === "string" ? (
        <Text onLongPress={handleLongPress} {...textProps}>
          {children}
        </Text>
      ) : (
        <Pressable onLongPress={handleLongPress} onPress={onPress}>
          {children}
        </Pressable>
      )}
      {showOverlay && (
        <AnimatedView
          style={{
            position: "absolute",
            top: -40,
            left: 0,
            backgroundColor: theme.colors.backgroundLighter,
            shadowColor: theme.colors.shadow,
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: theme.numbers.shadowOpacity,
            paddingHorizontal: 10,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.numbers.borderRadiusLg,
            opacity: opacity,
          }}
        >
          <View style={{ position: "relative" }}>
            <Text style={{ fontSize: theme.fontSize("sm") }}>
              {i18n.t("copied")}
            </Text>
            <IconButton
              size={25}
              style={{
                position: "absolute",
                left: -4,
                bottom: -22,
              }}
              icon={faCaretDown}
              iconStyle={{ color: theme.colors.backgroundLighter }}
            />
          </View>
        </AnimatedView>
      )}
    </View>
  );
};
export default Copyeable;
