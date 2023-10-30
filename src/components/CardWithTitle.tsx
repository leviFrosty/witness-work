import { ColorValue, View } from "react-native";
import Text from "./MyText";
import Card from "./Card";
import { PropsWithChildren } from "react";

interface Props {
  title: string;
  titlePosition?: "inside";
  titleColor?: ColorValue;
  noPadding?: boolean;
}

const CardWithTitle: React.FC<PropsWithChildren<Props>> = ({
  children,
  title,
  titlePosition,
  titleColor,
  noPadding,
}) => {
  return (
    <View style={{ gap: 10 }}>
      {!titlePosition && (
        <Text
          style={{
            fontSize: 14,
            fontFamily: "Inter_600SemiBold",
            marginLeft: 5,
            color: titleColor,
          }}
        >
          {title}
        </Text>
      )}
      <Card
        style={
          noPadding ? { paddingVertical: 0, paddingHorizontal: 0 } : undefined
        }
      >
        {titlePosition === "inside" && (
          <Text
            style={{
              fontSize: 14,
              fontFamily: "Inter_600SemiBold",
              marginLeft: 5,
            }}
          >
            {title}
          </Text>
        )}
        {children}
      </Card>
    </View>
  );
};

export default CardWithTitle;
