import { useNavigation } from "@react-navigation/native";
import {
  Icon,
  TopNavigation,
  TopNavigationAction,
} from "@ui-kitten/components";
import { TouchableWebElement } from "@ui-kitten/components/devsupport";
import { ImageProps } from "react-native";

interface TopBarNavWithBackButtonProps {
  title?: string;
  arrow?: "up" | "down" | "left" | "right";
  iconLeft?:
    | (() => React.ReactElement<any, string | React.JSXElementConstructor<any>>)
    | undefined;
  onPressLeft?: () => void;
  iconRight?:
    | (() => React.ReactElement<any, string | React.JSXElementConstructor<any>>)
    | undefined;
  onPressRight?: () => void;
}

const TopNavBarWithBackButton: React.FC<TopBarNavWithBackButtonProps> = ({
  title,
  arrow,
  iconLeft,
  onPressLeft,
  iconRight,
  onPressRight,
}) => {
  const navigation = useNavigation();

  const BackIcon = (
    props?: Partial<ImageProps>
  ): React.ReactElement<ImageProps> => (
    <Icon {...props} name={`arrow-${arrow || "left"}`} />
  );

  const goBack = () => navigation.goBack();

  const TopNavigationWithBackBottom = (): TouchableWebElement => (
    <TopNavigationAction
      icon={iconLeft || BackIcon}
      onPress={onPressLeft || goBack}
    />
  );

  const TopNavigationRight = () => (
    <TopNavigationAction icon={iconRight} onPress={onPressRight} />
  );

  return (
    <TopNavigation
      alignment="center"
      accessoryRight={
        !!iconRight && !!onPressRight ? TopNavigationRight : undefined
      }
      accessoryLeft={TopNavigationWithBackBottom}
      title={title}
    />
  );
};

export default TopNavBarWithBackButton;
