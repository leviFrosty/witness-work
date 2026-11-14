import { useState } from 'react'
import { Platform, View } from 'react-native'
import Constants from 'expo-constants'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Text from '@/components/ui/MyText'
import SearchField from '@/components/ui/SearchField'
import SidebarToggle from '@/components/ui/SidebarToggle'
import Switch from '@/components/ui/Switch'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import ToolsSections from '@/app/navigation/tools/ToolsSections'
import { MONO, ToolsSearch } from '@/app/navigation/tools/ToolsUI'

const SEARCH_FIELD_INDEX = 1

export default function ToolsScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const foldColumn = useFoldColumn(inputLayout.contentMaxWidth)
  const setPreferences = usePreferences((state) => state.set)
  const [query, setQuery] = useState('')

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: insets.top,
      }}
    >
      <KeyboardAwareScrollView
        stickyHeaderIndices={[SEARCH_FIELD_INDEX]}
        keyboardShouldPersistTaps='handled'
        contentContainerStyle={[
          {
            width: '100%',
            maxWidth: inputLayout.contentMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: 16,
            paddingTop: 30,
            paddingBottom: 300,
          },
          foldColumn,
        ]}
      >
        <View>
          <SidebarToggle mode='show' />
          <XView
            style={{
              gap: 12,
              marginHorizontal: inputLayout.horizontalPadding,
              alignItems: 'center',
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                accessibilityRole='header'
                style={{
                  fontSize: theme.fontSize('3xl'),
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('developerTools')}
              </Text>
              <Text
                selectable
                style={{
                  color: theme.colors.textAlt,
                  fontFamily: MONO,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {`v${Constants.expoConfig?.version ?? '?'} · ${Platform.OS} ${Platform.Version}`}
              </Text>
            </View>
            <Switch
              testID='tools-debugging-switch'
              accessibilityLabel={i18n.t('developerTools')}
              value
              onValueChange={(on) => {
                if (!on) setPreferences({ developerTools: false })
              }}
            />
          </XView>
        </View>

        <View
          style={{
            paddingVertical: 12,
            backgroundColor: theme.colors.background,
          }}
        >
          <SearchField
            testID='tools-search'
            query={query}
            onChangeQuery={setQuery}
            placeholder='Search tools'
          />
        </View>

        <View style={{ gap: 24, paddingTop: 8 }}>
          <ToolsSearch query={query}>
            <ToolsSections />
          </ToolsSearch>
        </View>
      </KeyboardAwareScrollView>
    </View>
  )
}
