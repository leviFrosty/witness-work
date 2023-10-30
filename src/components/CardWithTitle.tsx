import { ColorValue, View } from "react-native";
import MyText from "./MyText";
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
        <MyText
          style={{
            fontSize: 14,
            fontWeight: "600",
            marginLeft: 5,
            color: titleColor,
          }}
        >
          {title}
        </MyText>
      )}
      <Card
        style={
          noPadding ? { paddingVertical: 0, paddingHorizontal: 0 } : undefined
        }
      >
        {titlePosition === "inside" && (
          <MyText style={{ fontSize: 14, fontWeight: "600", marginLeft: 5 }}>
            {title}
          </MyText>
        )}
        {children}
      </Card>
    </View>
  );
};

export default CardWithTitle;
