import type { ReactNode } from 'react'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Header from '@/components/ui/layout/Header'
import useTheme from '@/contexts/theme'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

/**
 * A read-only details screen (Plan Details, Visit Details): its header, with
 * any actions on the right, over its scrolling body.
 */
export default function DetailsLayout({
  title,
  actions,
  sheet,
  children,
}: {
  title: string
  actions?: ReactNode
  /** Presented as a modal sheet, which has no status bar to clear. */
  sheet?: boolean
  children: ReactNode
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const foldColumn = useFoldColumn(720)
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        buttonType='back'
        noInsets={sheet}
        title={title}
        rightElement={
          actions ? (
            <View
              style={{
                position: 'absolute',
                right: 0,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 24,
              }}
            >
              {actions}
            </View>
          ) : undefined
        }
      />
      <ScrollView
        contentContainerStyle={[
          {
            padding: 15,
            gap: 20,
            paddingBottom: insets.bottom + 30,
            width: '100%',
            maxWidth: 720,
            alignSelf: 'center',
          },
          foldColumn,
        ]}
      >
        {children}
      </ScrollView>
    </View>
  )
}
