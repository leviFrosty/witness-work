import { ColorValue, StyleProp, View, ViewStyle, ViewProps } from 'react-native'
import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import { PropsWithChildren, ReactNode } from 'react'
import useTheme from '@/contexts/theme'
import Divider from '@/components/ui/Divider'

interface Props extends ViewProps {
  title: string | ReactNode
  titlePosition?: 'inside'
  titleColor?: ColorValue
  noPadding?: boolean
  style?: StyleProp<ViewStyle>
  cardStyle?: StyleProp<ViewStyle>
}

const CardWithTitle: React.FC<PropsWithChildren<Props>> = ({
  children,
  title,
  titlePosition,
  titleColor,
  noPadding,
  style,
  cardStyle,
  ...rest
}) => {
  const theme = useTheme()
  return (
    <View style={[[{ gap: 10 }], [style]]} {...rest}>
      {!titlePosition && typeof title === 'string' && (
        <Text
          style={{
            fontSize: 14,
            fontFamily: theme.fonts.semiBold,
            marginLeft: 5,
            color: titleColor || theme.colors.text,
          }}
        >
          {title}
        </Text>
      )}
      <Card
        style={[
          noPadding ? { paddingVertical: 0, paddingHorizontal: 0 } : undefined,
          cardStyle,
        ]}
      >
        {titlePosition === 'inside' && typeof title === 'string' ? (
          <View style={{ gap: 10 }}>
            <Text
              style={{
                fontSize: theme.fontSize('md'),
                fontFamily: theme.fonts.semiBold,
                color: titleColor || theme.colors.text,
              }}
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
  )
}

export default CardWithTitle
