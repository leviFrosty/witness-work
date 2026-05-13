import { PropsWithChildren, useState } from 'react'
import { ViewProps } from 'react-native'
import Card from '@/components/ui/Card'
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import XView from '@/components/ui/layout/XView'
import IconButton from '@/components/ui/IconButton'
import { faCaretUp } from '@fortawesome/free-solid-svg-icons'
import Button from '@/components/ui/Button'
import useTheme from '@/contexts/theme'

interface Props extends ViewProps {
  expanded?: boolean
  setExpanded?: (expanded: boolean) => void
  onExpand?: (expanded: boolean) => void
  defaultValue?: boolean
  header: React.ReactNode
}

const Accordion: React.FC<PropsWithChildren<Props>> = ({
  children,
  defaultValue,
  onExpand,
  header,
  ...props
}) => {
  const [internalExpanded, setExpanded] = useState(defaultValue ?? false)
  const theme = useTheme()
  const progress = useSharedValue(defaultValue ? 1 : 0)

  const expanded = props.expanded ?? internalExpanded

  const handleToggleExpand = () => {
    props.setExpanded?.(!expanded)
    setExpanded(!expanded)
    onExpand?.(expanded)

    progress.value = withTiming(expanded ? 0 : 1, {
      duration: 200,
      easing: Easing.in(Easing.quad),
    })
  }

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { rotate: `${interpolate(progress.value, [0, 1], [0, 180])}deg` },
      ],
    }
  })

  const viewStyle = useAnimatedStyle(() => {
    return {
      opacity: progress.value,
    }
  })

  return (
    <Card {...props}>
      <Button style={{ gap: expanded ? 20 : 0 }} onPress={handleToggleExpand}>
        <XView style={{ justifyContent: 'space-between' }}>
          {header}
          <Animated.View style={animatedStyle}>
            <IconButton icon={faCaretUp} color={theme.colors.text} />
          </Animated.View>
        </XView>
        <Animated.View style={[{ height: expanded ? 'auto' : 0 }, [viewStyle]]}>
          {children}
        </Animated.View>
      </Button>
    </Card>
  )
}

export default Accordion
