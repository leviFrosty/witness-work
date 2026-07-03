import { ColorValue, StyleProp, View, ViewStyle } from 'react-native'
import { ReactNode, useState } from 'react'
import { faTimes } from '@fortawesome/free-solid-svg-icons/faTimes'
import useTheme from '@/contexts/theme'
import CardWithTitle from '@/components/CardWithTitle'
import IconButton from '@/components/ui/IconButton'

interface Props {
  title: ReactNode
  titleColor?: ColorValue
  style?: StyleProp<ViewStyle>
  cardStyle?: StyleProp<ViewStyle>
  dismissIconColor?: string
  onDismiss?: () => void
  children?: ReactNode
}

const DismissableCard = ({
  title,
  titleColor,
  style,
  cardStyle,
  dismissIconColor,
  onDismiss,
  children,
}: Props) => {
  const theme = useTheme()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  const composedTitle = (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      <View style={{ flex: 1 }}>{title}</View>
      <IconButton
        icon={faTimes}
        color={dismissIconColor ?? theme.colors.textAlt}
        onPress={handleDismiss}
      />
    </View>
  )

  return (
    <CardWithTitle
      title={composedTitle}
      titlePosition='inside'
      titleColor={titleColor}
      style={style}
      cardStyle={cardStyle}
    >
      {children}
    </CardWithTitle>
  )
}

export default DismissableCard
