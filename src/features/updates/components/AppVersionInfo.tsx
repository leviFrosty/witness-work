import { useState } from 'react'
import { View } from 'react-native'
import Constants from 'expo-constants'
import Text from '@/components/ui/MyText'
import Badge from '@/components/ui/Badge'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'

export default function AppVersionInfo() {
  const theme = useTheme()
  const { developerTools, set } = usePreferences()
  const [count, setCount] = useState(0)

  const incrementHiddenCounter = () => {
    if (count === 4) {
      set({ developerTools: !developerTools })
      setCount(0)
    } else {
      setCount(count + 1)
    }
  }

  return (
    <View style={{ gap: 5, alignItems: 'center' }}>
      <Text
        style={{
          textAlign: 'center',
          color: theme.colors.textAlt,
          fontFamily: theme.fonts.semiBold,
          fontSize: 14,
        }}
        onPress={incrementHiddenCounter}
      >
        {Constants.expoConfig?.version
          ? `v${Constants.expoConfig.version} (${Constants.expoConfig.extra?.commitHash ?? '?'})`
          : i18n.t('versionUnknown')}
      </Text>
      {developerTools && (
        <Badge>
          <Text style={{ color: theme.colors.textInverse }}>
            {i18n.t('devToolsEnabled')}
          </Text>
        </Badge>
      )}
    </View>
  )
}
