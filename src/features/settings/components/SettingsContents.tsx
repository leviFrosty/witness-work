import { useEffect, useState } from 'react'
import { Keyboard, View } from 'react-native'
import { CommonActions, useNavigation } from '@react-navigation/native'
import { GroupedList } from '@/components/ui/GroupedList'
import { analytics } from '@/lib/analytics'
import useTheme from '@/contexts/theme'
import PreferencesSection from '@/features/settings/components/sections/Preferences'
import AppSection from '@/features/settings/components/sections/App'
import ScribeSection from '@/features/settings/components/sections/Scribe'
import ContactSection from '@/features/settings/components/sections/Contact'
import AboutSection from '@/features/settings/components/sections/About'
import SupportSection from '@/features/settings/components/sections/Support'
import SettingsSearchHeader from '@/features/settings/components/search/SettingsSearchHeader'
import SettingsSearchResults from '@/features/settings/components/search/SettingsSearchResults'
import useAvailableSettingsSearchItems from '@/features/settings/hooks/useAvailableSettingsSearchItems'
import {
  searchSettings,
  settingsSearchPath,
  type SettingsSearchItem,
  type SettingsSearchItemId,
  type SettingsSearchRoute,
} from '@/features/settings/lib/settingsSearch'
import useSettingsSearchTarget from '@/features/settings/stores/settingsSearchTarget'
import ManageSubscriptionSheet from '@/features/supporter/components/ManageSubscriptionSheet'
import ScribeZeroDataRetentionSheet from '@/features/scribe/components/ScribeZeroDataRetentionSheet'
import { RootStackNavigation, RootStackParamList } from '@/types/rootStack'

const NO_RESULTS_SETTLE_MS = 1500

type Props = {
  onNavigate?: (destination: keyof RootStackParamList) => void
  onOpenSearchResult?: (path: SettingsSearchRoute[]) => void
  selectedDestination?: keyof RootStackParamList
}

export default function SettingsContents({
  onNavigate,
  onOpenSearchResult,
  selectedDestination,
}: Props) {
  const navigation = useNavigation<RootStackNavigation>()
  const theme = useTheme()

  const [manageSubscriptionOpen, setManageSubscriptionOpen] = useState(false)
  const [zeroDataRetentionOpen, setZeroDataRetentionOpen] = useState(false)
  const [query, setQuery] = useState('')
  const searchableItems = useAvailableSettingsSearchItems()
  const results = searchSettings(query, searchableItems)
  const isSearching = query.trim().length > 0
  const requestTarget = useSettingsSearchTarget((state) => state.request)

  const hasNoResults = isSearching && results.length === 0
  useEffect(() => {
    if (!hasNoResults) return
    const timer = setTimeout(
      () =>
        analytics.capture('settings_search_completed', {
          outcome: 'no_results',
        }),
      NO_RESULTS_SETTLE_MS
    )
    return () => clearTimeout(timer)
  }, [hasNoResults, query])

  const handleNavigate = (destination: keyof RootStackParamList) => {
    if (onNavigate) return onNavigate(destination)

    navigation.navigate(destination as any)
  }

  const openSearchResult = (item: SettingsSearchItem) => {
    Keyboard.dismiss()
    analytics.capture('settings_search_completed', { outcome: 'opened' })

    const path = settingsSearchPath(item.page)
    if (path.length === 0) {
      setQuery('')
      return
    }
    if (!item.isPage) requestTarget(item.id as SettingsSearchItemId)
    if (onOpenSearchResult) {
      setQuery('')
      onOpenSearchResult(path)
      return
    }
    navigation.dispatch(CommonActions.navigate(path[path.length - 1]))
  }

  const sectionProps = { handleNavigate, selectedDestination }

  return (
    <>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <SettingsSearchHeader
          query={query}
          onChangeQuery={setQuery}
          onSubmit={() => {
            if (results[0]) openSearchResult(results[0])
          }}
        />
        {isSearching ? (
          <SettingsSearchResults
            results={results}
            onOpen={(item) => openSearchResult(item)}
          />
        ) : (
          <GroupedList>
            <PreferencesSection {...sectionProps} />
            <AppSection {...sectionProps} />
            <ScribeSection
              {...sectionProps}
              onZeroDataRetention={() => setZeroDataRetentionOpen(true)}
            />
            <SupportSection
              {...sectionProps}
              onManageSubscription={() => setManageSubscriptionOpen(true)}
            />
            <ContactSection {...sectionProps} />
            <AboutSection {...sectionProps} />
          </GroupedList>
        )}
      </View>
      <ManageSubscriptionSheet
        open={manageSubscriptionOpen}
        setOpen={setManageSubscriptionOpen}
        source='settings'
      />
      <ScribeZeroDataRetentionSheet
        open={zeroDataRetentionOpen}
        setOpen={setZeroDataRetentionOpen}
      />
    </>
  )
}
