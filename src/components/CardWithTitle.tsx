import {
  ColorValue,
  StyleProp,
  View,
  ViewStyle,
  TextStyle,
} from "react-native";
import Text from "./MyText";
import Card from "./Card";
import { PropsWithChildren, ReactNode } from "react";
import useTheme from "../contexts/theme";
import Divider from "./Divider";

interface Props {
  title: string | ReactNode;
  titlePosition?: "inside";
  titleColor?: ColorValue;
  noPadding?: boolean;
  style?: StyleProp<ViewStyle>;
  titleStyle?: TextStyle;
}

const CardWithTitle: React.FC<PropsWithChildren<Props>> = ({
  children,
  title,
  titlePosition,
  titleColor,
  noPadding,
  style,
  titleStyle,
}) => {
  const theme = useTheme();
  return (
    <View style={[[{ gap: 10 }], [style]]}>
      {!titlePosition && typeof title === "string" && (
        <Text
          style={[
            [
              {
                fontSize: 14,
                fontFamily: "Inter_600SemiBold",
                marginLeft: 5,
                color: titleColor || theme.colors.text,
              },
            ],
            [titleStyle],
          ]}
        >
          {title}
        </Text>
      )}
      <Card
        style={
          noPadding ? { paddingVertical: 0, paddingHorizontal: 0 } : undefined
        }
      >
        {titlePosition === "inside" && typeof title === "string" ? (
          <View style={{ gap: 10 }}>
            <Text
              style={[
                [
                  {
                    fontSize: theme.fontSize("md"),
                    fontFamily: "Inter_600SemiBold",
                    color: titleColor || theme.colors.text,
                  },
                ],
                [titleStyle],
              ]}
            >
              {title}
            </Text>
            <Divider />
          </View>
        ) : (
          title
        )}
        {children}
      </Card>
    </View>
  );
};

export default CardWithTitle;
