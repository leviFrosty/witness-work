import React, { PropsWithChildren } from "react";
import {
  GestureResponderEvent,
  Pressable,
  StyleProp,
  ViewStyle,
} from "react-native";
import Haptics from "../lib/haptics";
import Animated, {
  Easing,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

interface Props {
  onPress?: (event: GestureResponderEvent) => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  noTransform?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const Button: React.FC<PropsWithChildren<Props>> = ({
  children,
  onPress,
  onLongPress,
  style,
  disabled,
  noTransform,
}) => {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  const _onPress = (event: GestureResponderEvent) => {
    Haptics.light();
    onPress?.(event);
  };

  const _onLongPress = (event: GestureResponderEvent) => {
    Haptics.medium();
    onLongPress?.(event);
  };

  const onPressIn = () => {
    opacity.value = 0.7;
    if (noTransform) {
      return;
    }
    translateY.value = withTiming(1, {
      duration: 10,
      easing: Easing.in(Easing.quad),
    });
  };

  const onPressOut = () => {
    opacity.value = 1;
    if (noTransform) {
      return;
    }
    translateY.value = withTiming(0, {
      duration: 20,
      easing: Easing.in(Easing.quad),
    });
  };

  return (
    <AnimatedPressable
      hitSlop={10}
      disabled={disabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={onPress ? _onPress : undefined}
      onLongPress={onLongPress ? _onLongPress : undefined}
      style={[
        [
          {
            transform: [{ translateY: translateY }],
            opacity,
          },
        ],
        [style],
      ]}
    >
      {children}
    </AnimatedPressable>
  );
};

export default Button;
