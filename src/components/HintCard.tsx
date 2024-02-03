import { PropsWithChildren } from 'react'
import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import { hints, usePreferences } from '../stores/preferences'
import Button from './Button'
import Card from './Card'
import Text from './MyText'
import { View, ViewProps } from 'react-native'
import XView from './layout/XView'

interface HintCardProps extends ViewProps {
  /** The key identifier */
  hintKey: keyof typeof hints
}

const HintCard: React.FC<PropsWithChildren<HintCardProps>> = ({
  hintKey,
  children,
  ...props
}) => {
  const theme = useTheme()
  const { removeHint } = usePreferences()

  return (
    <Card
      style={{
        borderColor: theme.colors.warn,
        borderWidth: 1,
        backgroundColor: theme.colors.warnTranslucent,
      }}
      {...props}
    >
      <XView style={{ gap: 10 }}>
        <View style={{ flexGrow: 1, minWidth: 0, flex: 1 }}>{children}</View>
        <Button onPress={() => removeHint(hintKey)}>
          <Text style={{ textDecorationLine: 'underline' }}>
            {i18n.t('gotIt')}
          </Text>
        </Button>
      </XView>
    </Card>
  )
}

export default HintCard
