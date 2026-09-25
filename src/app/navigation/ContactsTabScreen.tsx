import { useEffect, useState } from 'react'
import { Keyboard, StyleSheet, View, ViewProps } from 'react-native'
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import SegmentedControl from '@/components/ui/SegmentedControl'
import ContactRow from '@/features/contacts/components/ContactRow'
import ContactsScreen from '@/features/contacts/screens/ContactsScreen'
import MapScreen from '@/features/map/screens/MapScreen'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { ContactsView, HomeTabStackParamList } from '@/types/homeStack'

type Props = BottomTabScreenProps<HomeTabStackParamList, 'Contacts'>

const SWITCH_HEIGHT = 40
const SWITCH_TOP_INSET = SWITCH_HEIGHT + 8

/**
 * The Contacts tab: a List | Map switch floated over the contacts list and the
 * contacts map. Composed here so the two features never import each other.
 *
 * The map mounts on first use (MapKit is expensive) and then stays mounted but
 * hidden, so toggling back keeps its camera, search, and carousel position.
 * Hidden views use opacity rather than `display: 'none'`, which would tear down
 * the native map view on every toggle.
 */
export default function ContactsTabScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets()
  const { sidebarWidth } = useAdaptiveLayout()
  const view = usePreferences((s) => s.contactsView)
  const set = usePreferences((s) => s.set)
  const [mapMounted, setMapMounted] = useState(view === 'map')
  const [mapFitRequest, setMapFitRequest] = useState(0)
  const showsMap = view === 'map'

  const selectView = (next: ContactsView) => {
    Keyboard.dismiss()
    if (next === 'map') {
      setMapMounted(true)
      setMapFitRequest((request) => request + 1)
    }
    set({ contactsView: next })
  }

  // Other screens open a specific view with `navigate('Contacts', { view })`.
  // Apply it, then clear the param so the switch owns the view again.
  const requestedView = route.params?.view
  useEffect(() => {
    if (!requestedView) return
    Keyboard.dismiss()
    if (requestedView === 'map') {
      setMapMounted(true)
      setMapFitRequest((request) => request + 1)
    }
    set({ contactsView: requestedView })
    navigation.setParams({ view: undefined })
  }, [requestedView, navigation, set])

  // Re-entering the tab on the map re-fits the pins, as the Map tab used to.
  useEffect(
    () =>
      navigation.addListener('tabPress', () => {
        if (usePreferences.getState().contactsView !== 'map') return
        setMapFitRequest((request) => request + 1)
      }),
    [navigation]
  )

  const hiddenProps = (hidden: boolean): ViewProps => ({
    pointerEvents: hidden ? 'none' : 'auto',
    accessibilityElementsHidden: hidden,
    importantForAccessibility: hidden ? 'no-hide-descendants' : 'auto',
    style: [StyleSheet.absoluteFill, { opacity: hidden ? 0 : 1 }],
  })

  return (
    <View style={{ flex: 1 }}>
      <View {...hiddenProps(showsMap)}>
        <ContactsScreen topInset={SWITCH_TOP_INSET} />
      </View>
      {(mapMounted || showsMap) && (
        <View {...hiddenProps(!showsMap)}>
          <MapScreen
            topInset={SWITCH_TOP_INSET}
            fitRequest={mapFitRequest}
            visible={showsMap}
            renderContactRow={(props) => (
              <ContactRow {...props} showsDisclosure={false} />
            )}
          />
        </View>
      )}
      {/* On iPad the map extends under the sidebar, so line the switch up
          with the content column rather than the screen edge. */}
      <View
        pointerEvents='box-none'
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: (showsMap ? sidebarWidth : 0) + 12,
          right: 12,
        }}
      >
        <SegmentedControl<ContactsView>
          value={view}
          onChange={selectView}
          options={[
            { key: 'list', label: i18n.t('list') },
            { key: 'map', label: i18n.t('map') },
          ]}
          style={{
            width: '100%',
            maxWidth: 400,
            height: SWITCH_HEIGHT,
            alignSelf: 'center',
          }}
        />
      </View>
    </View>
  )
}
