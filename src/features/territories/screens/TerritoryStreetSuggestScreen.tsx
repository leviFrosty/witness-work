import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { ActivityIndicator, Platform, ScrollView, View } from 'react-native'
import * as Crypto from 'expo-crypto'
import * as Location from 'expo-location'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Plus as PlusIcon } from 'lucide-react-native'
import LocationNotice from '@/components/LocationNotice'
import ActionButton from '@/components/ui/ActionButton'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Section from '@/components/ui/inputs/Section'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import Header from '@/components/ui/layout/Header'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useLocationAccess from '@/hooks/useLocationAccess'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'
import PickMark from '@/features/territories/components/sharing/PickMark'
import { saveStreet } from '@/features/territories/lib/doors'
import { territoryAccess } from '@/features/territories/lib/sharing'
import {
  findOutlineStreets,
  newStreetNames,
  outlineSamplePoints,
  suggestedStreet,
  type StreetSearch,
} from '@/features/territories/lib/streetSuggestions'
import {
  useTerritories,
  useTerritory,
} from '@/features/territories/stores/territories'
import type { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<
  RootStackParamList,
  'TerritoryStreetSuggest'
>

const PAUSE_MS = 300

const pause = () =>
  new Promise<void>((resolve) => setTimeout(resolve, PAUSE_MS))

const GEOCODER_NEEDS_LOCATION = Platform.select({
  android: true,
  default: false,
})

export default function TerritoryStreetSuggestScreen({
  route,
  navigation,
}: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { territoryId } = route.params
  const territory = useTerritory(territoryId)
  const update = useTerritories((state) => state.update)
  const outline = territory?.outline
  const [search, setSearch] = useState<StreetSearch>({
    names: [],
    checked: 0,
    total: 0,
    stopped: false,
    done: false,
  })
  const location = useLocationAccess({ enabled: GEOCODER_NEEDS_LOCATION })
  const allowed = !GEOCODER_NEEDS_LOCATION || location.granted
  const blocked = GEOCODER_NEEDS_LOCATION && location.notice
  const [skipped, setSkipped] = useState<string[]>([])
  const report = useRef({ sent: false, search })

  const editable =
    !!territory &&
    territory.finishedAt === undefined &&
    territoryAccess(territory) === 'owner'

  useEffect(() => {
    if (!editable) navigation.goBack()
  }, [editable, navigation])

  const askOnce = useEffectEvent(() => {
    if (GEOCODER_NEEDS_LOCATION) void location.request()
  })

  useEffect(() => {
    askOnce()
  }, [])

  useEffect(() => {
    if (!allowed) return
    let left = false
    const run = async () => {
      const points = outlineSamplePoints(outline)
      await findOutlineStreets({
        points,
        geocode: (point) => Location.reverseGeocodeAsync(point),
        onProgress: (next) => {
          report.current.search = next
          setSearch(next)
        },
        cancelled: () => left,
        pause,
      })
    }
    void run()
    const sent = report.current
    return () => {
      left = true
      if (sent.sent || sent.search.checked === 0) return
      sent.sent = true
      analytics.capture('territory_streets_suggested', {
        points: sent.search.checked,
        found: sent.search.names.length,
        added: 0,
        stopped: sent.search.stopped || !sent.search.done,
      })
    }
  }, [outline, allowed])

  if (!territory || !editable) return null

  const fresh = newStreetNames(search.names, territory.streets)
  const picked = fresh.filter((name) => !skipped.includes(name))
  const searching = !search.done && !blocked

  const toggle = (name: string) =>
    setSkipped((had) =>
      had.includes(name)
        ? had.filter((entry) => entry !== name)
        : [...had, name]
    )

  const add = () => {
    update(territoryId, (current) =>
      newStreetNames(picked, current.streets).reduce(
        (next, name) =>
          saveStreet(next, suggestedStreet(Crypto.randomUUID(), name)),
        current
      )
    )
    report.current.sent = true
    analytics.capture('territory_streets_suggested', {
      points: search.checked,
      found: search.names.length,
      added: picked.length,
      stopped: search.stopped || !search.done,
    })
    toast.success(
      i18n.t('territories.suggest.added_toast', { count: picked.length })
    )
    navigation.goBack()
  }

  const note = (text: string, testID?: string) => (
    <Text
      testID={testID}
      style={{
        color: theme.colors.textAlt,
        fontSize: theme.fontSize('sm'),
        paddingHorizontal: 5,
      }}
    >
      {text}
    </Text>
  )

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        noInsets
        buttonType='back'
        title={i18n.t('territories.suggest.title')}
      />
      <ScrollView>
        <ContentColumn
          style={{
            padding: inputLayout.horizontalPadding,
            paddingBottom: insets.bottom + 30,
            gap: 16,
          }}
        >
          {blocked && location.access ? (
            <View style={{ gap: 4 }}>
              {note(
                i18n.t('territories.suggest.locationNeeded'),
                'suggest-blocked'
              )}
              <LocationNotice
                access={location.access}
                fix={location.fix}
                onFix={location.runFix}
                testID='suggest-location-notice'
                style={{ paddingStart: 5 }}
              />
            </View>
          ) : (
            <>
              {note(i18n.t('territories.suggest.bestGuess'))}
              {searching && (
                <View
                  testID='suggest-progress'
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingHorizontal: 5,
                    minHeight: 24,
                  }}
                >
                  <ActivityIndicator color={theme.colors.textAlt} />
                  <Text style={{ color: theme.colors.textAlt }}>
                    {i18n.t('territories.suggest.checking', {
                      checked: search.checked,
                      total: search.total,
                    })}
                  </Text>
                </View>
              )}
            </>
          )}

          {fresh.length > 0 && (
            <Section>
              {fresh.map((name, index) => (
                <InputRowButton
                  key={name}
                  testID={`suggest-street-${index}`}
                  label={name}
                  checked={!skipped.includes(name)}
                  onPress={() => toggle(name)}
                  lastInSection={index === fresh.length - 1}
                >
                  <PickMark picked={!skipped.includes(name)} />
                </InputRowButton>
              ))}
            </Section>
          )}

          {search.stopped && note(i18n.t('territories.suggest.stopped'))}

          {search.done && fresh.length === 0 && (
            <View style={{ gap: 12 }}>
              <View style={{ gap: 4, paddingHorizontal: 5 }}>
                <Text
                  testID='suggest-none'
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    fontSize: theme.fontSize('lg'),
                  }}
                >
                  {i18n.t('territories.suggest.none')}
                </Text>
                <Text style={{ color: theme.colors.textAlt }}>
                  {i18n.t('territories.suggest.none_description')}
                </Text>
              </View>
              <Section>
                <InputRowButton
                  testID='suggest-add-by-hand'
                  leftIcon={PlusIcon}
                  label={i18n.t('territories.addStreet')}
                  onPress={() =>
                    navigation.replace('TerritoryStreetForm', { territoryId })
                  }
                  lastInSection
                />
              </Section>
            </View>
          )}

          {fresh.length > 0 && (
            <ActionButton
              testID='suggest-add'
              disabled={picked.length === 0}
              onPress={add}
            >
              {i18n.t('territories.suggest.add', { count: picked.length })}
            </ActionButton>
          )}
        </ContentColumn>
      </ScrollView>
    </View>
  )
}
