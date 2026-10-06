import type { ReactNode } from 'react'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Header from '@/components/ui/layout/Header'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

/** Plan Details' header (with any actions) over its scrolling body. */
export default function PlanDetailsLayout({
  actions,
  children,
}: {
  actions?: ReactNode
  children: ReactNode
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        buttonType='back'
        title={i18n.t('plan')}
        rightElement={
          actions ? (
            <View
              style={{
                position: 'absolute',
                right: 0,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 16,
              }}
            >
              {actions}
            </View>
          ) : undefined
        }
      />
      <ScrollView
        contentContainerStyle={{
          padding: 15,
          gap: 20,
          paddingBottom: insets.bottom + 30,
          width: '100%',
          maxWidth: 720,
          alignSelf: 'center',
        }}
      >
        {children}
      </ScrollView>
    </View>
  )
}
