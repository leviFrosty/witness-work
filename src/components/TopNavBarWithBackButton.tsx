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
}

const TopNavBarWithBackButton: React.FC<TopBarNavWithBackButtonProps> = ({
  title,
  arrow,
}) => {
  const navigation = useNavigation();

  const BackIcon = (
    props?: Partial<ImageProps>
  ): React.ReactElement<ImageProps> => (
    <Icon {...props} name={`arrow-${arrow || "left"}`} />
  );

  const TopNavigationWithBackBottom = (): TouchableWebElement => (
    <TopNavigationAction icon={BackIcon} onPress={() => navigation.goBack()} />
  );

  return (
    <TopNavigation
      alignment="center"
      accessoryLeft={TopNavigationWithBackBottom}
      title={title}
    />
  );
};

export default TopNavBarWithBackButton;
