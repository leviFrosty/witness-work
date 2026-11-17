import { ActivityIndicator, View } from 'react-native'
import Empty from '@/components/ui/Empty'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

export default function BuddiesOnTheirWay({ checking }: { checking: boolean }) {
  const theme = useTheme()
  const foldColumn = useFoldColumn(720)
  const spinner = (
    <ActivityIndicator
      color={theme.colors.textAlt}
      accessibilityLabel={i18n.t('buddies_loading')}
    />
  )

  return (
    <View
      style={[
        {
          flex: 1,
          justifyContent: 'center',
          paddingHorizontal: 15,
          width: '100%',
          maxWidth: 720,
          alignSelf: 'center',
        },
        foldColumn,
      ]}
    >
      {checking ? (
        spinner
      ) : (
        <Empty
          icon={spinner}
          title={i18n.t('buddies_onTheirWayTitle')}
          description={i18n.t('buddies_onTheirWayBody')}
        />
      )}
    </View>
  )
}
