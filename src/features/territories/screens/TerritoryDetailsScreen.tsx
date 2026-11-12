import { useEffect } from 'react'
import { View } from 'react-native'
import * as Crypto from 'expo-crypto'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Archive as ArchiveIcon,
  Image as ImageIcon,
  Map as MapIcon,
  Navigation as NavigationIcon,
  NotebookPen as NotebookPenIcon,
  Pencil as PencilIcon,
  ShieldCheck as ShieldCheckIcon,
  Users as UsersIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import Header from '@/components/ui/layout/Header'
import KeyboardAwareScrollView from '@/components/ui/layout/KeyboardAwareScrollView'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useLocalDay from '@/hooks/useLocalDay'
import { openURL } from '@/lib/links'
import i18n from '@/lib/locales'
import { hasCapability } from '@/lib/platformCapabilities'
import { usePreferences } from '@/stores/preferences'
import TerritoryActions from '@/features/territories/components/TerritoryActions'
import TerritoryNotHomeSection from '@/features/territories/components/TerritoryNotHomeSection'
import TerritoryDoNotCallSection from '@/features/territories/components/TerritoryDoNotCallSection'
import TerritoryHeaderAction from '@/features/territories/components/TerritoryHeaderAction'
import TerritoryPill from '@/features/territories/components/TerritoryPill'
import TerritoryStreetsSection from '@/features/territories/components/TerritoryStreetsSection'
import TerritoryReceivedCard from '@/features/territories/components/sharing/TerritoryReceivedCard'
import TerritorySharedWithSection from '@/features/territories/components/sharing/TerritorySharedWithSection'
import useTerritoryActions from '@/features/territories/hooks/useTerritoryActions'
import { useStreetMenu } from '@/features/territories/hooks/useTerritoryMenu'
import {
  liveShareCount,
  heldStreetIds,
  territoryAccess,
} from '@/features/territories/lib/sharing'
import useDoorRecordPrivacy from '@/features/territories/hooks/useDoorRecordPrivacy'
import {
  canAddFromNotes,
  canShareTerritory,
} from '@/features/territories/lib/menuItems'
import {
  nextStreet,
  isOverdue,
  territoryDoNotCalls,
  territoryWorkState,
  workingStreets,
} from '@/features/territories/lib/doors'
import { openTerritoryInMaps } from '@/features/territories/lib/openTerritory'
import {
  isOutline,
  territoryPoint,
} from '@/features/territories/lib/territoryArea'
import {
  hasMapView,
  hasTerritoryMap,
  territoryMapMarkers,
} from '@/features/territories/lib/territoryMap'
import {
  formatDoorAddress,
  territoryDueText,
  territoryProgressText,
  territoryTitle,
} from '@/features/territories/lib/territoryTitle'
import {
  useTerritories,
  useTerritory,
} from '@/features/territories/stores/territories'
import type { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<RootStackParamList, 'TerritoryDetails'>

export default function TerritoryDetailsScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { territoryId } = route.params
  const territory = useTerritory(territoryId)
  const update = useTerritories((state) => state.update)
  const territoryActions = useTerritoryActions()
  const streetMenu = useStreetMenu()
  const provider = usePreferences((state) => state.defaultNavigationMapProvider)
  const privacy = useDoorRecordPrivacy()
  useLocalDay()

  useEffect(() => {
    if (!territory) navigation.popTo('Root', { screen: 'Territories' } as never)
  }, [territory, navigation])

  if (!territory) return null

  const finished = territory.finishedAt !== undefined
  const overdue = isOverdue(territory, Date.now())
  const link = territory.link
  const doNotCalls = territoryDoNotCalls(territory, formatDoorAddress)
  const markers = territoryMapMarkers(territory, {
    privacy,
    formatAddress: formatDoorAddress,
  })
  const showsMap = hasTerritoryMap(territory, markers)
  const cardOnly = showsMap && !hasMapView(territory, markers)
  const directionsTo = territoryPoint(territory)

  const upNext = nextStreet(territory)
  const workState = territoryWorkState(territory)
  const allWorked = workState === 'allWorked' || workState === 'allHandedOff'
  const access = territoryAccess(territory)
  const owner = access === 'owner'
  const canShare = canShareTerritory(territory)
  const shareCount = canShare ? liveShareCount(territory, Date.now()) : 0
  const openStreet = (streetId: string) =>
    navigation.navigate('TerritoryStreet', { territoryId, streetId })
  const requestFinish = () => territoryActions.requestReturn(territory)

  const caption = (text: string) => (
    <Text
      style={{
        textAlign: 'center',
        color: theme.colors.textAlt,
        fontSize: theme.fontSize('sm'),
      }}
    >
      {text}
    </Text>
  )
  const openMap = (view?: 'card') =>
    navigation.navigate('TerritoryMap', { territoryId, view })
  const canReturn = !finished && !allWorked && owner
  const canSuggest =
    owner &&
    !finished &&
    isOutline(territory.outline) &&
    hasCapability('reverseGeocoding')
  const canAddNotes = canAddFromNotes(territory, privacy)
  const returnCaption = caption(
    i18n.t(
      privacy
        ? 'territories.finish_captionPrivacy'
        : 'territories.finish_caption'
    )
  )

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        buttonType='back'
        title={territoryTitle(territory)}
        rightElement={
          owner ? (
            <TerritoryHeaderAction
              icon={PencilIcon}
              label={i18n.t('edit')}
              onPress={() =>
                navigation.navigate('TerritoryForm', { territoryId })
              }
              testID='territory-edit'
            />
          ) : undefined
        }
      />
      <KeyboardAwareScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps='handled'
      >
        <ContentColumn
          style={{
            padding: inputLayout.horizontalPadding,
            paddingBottom: insets.bottom + 30,
            gap: 24,
          }}
        >
          <View style={{ gap: 4, paddingHorizontal: 5 }}>
            {territory.name && (
              <Text
                accessibilityRole='header'
                style={{
                  fontFamily: theme.fonts.bold,
                  fontSize: theme.fontSize('2xl'),
                }}
              >
                {territory.name}
              </Text>
            )}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: 'wrap',
                columnGap: 12,
              }}
            >
              {owner && (
                <Text
                  testID='territory-dates'
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    color: overdue ? theme.colors.error : theme.colors.textAlt,
                  }}
                >
                  {territoryDueText(territory, Date.now())}
                </Text>
              )}
              {finished && (
                <Button
                  testID='territory-reopen'
                  onPress={() => territoryActions.reopen(territory)}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <Text
                    style={{
                      fontFamily: theme.fonts.semiBold,
                      textDecorationLine: 'underline',
                    }}
                  >
                    {i18n.t('territories.reopen')}
                  </Text>
                </Button>
              )}
            </View>
            {!finished && (
              <Text
                testID='territory-summary'
                style={{ color: theme.colors.textAlt }}
              >
                {territoryProgressText(territory)}
              </Text>
            )}
            {!finished && privacy && (
              <Button
                onPress={() => navigation.navigate('PreferencesPrivacy')}
                testID='territory-privacy'
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  gap: 6,
                  minHeight: 44,
                }}
              >
                <LucideIcon
                  icon={ShieldCheckIcon}
                  size={16}
                  color={theme.colors.textAlt}
                />
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    textDecorationLine: 'underline',
                  }}
                >
                  {i18n.t('territories.privacyOn_note')}
                </Text>
              </Button>
            )}
            {(showsMap || link || directionsTo || canShare) && (
              <View
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  marginTop: 8,
                }}
              >
                {(showsMap || link) && (
                  <TerritoryPill
                    fill
                    dense
                    icon={cardOnly ? ImageIcon : MapIcon}
                    label={i18n.t(
                      cardOnly
                        ? 'territories.map.viewCard'
                        : territory.photo
                          ? 'territories.map.openWithCard'
                          : 'territories.map.open'
                    )}
                    onPress={() =>
                      showsMap
                        ? openMap(cardOnly ? 'card' : undefined)
                        : link && void openURL(link)
                    }
                    testID='territory-map-open'
                  />
                )}
                {directionsTo && (
                  <TerritoryPill
                    fill
                    dense
                    icon={NavigationIcon}
                    label={i18n.t('directions')}
                    onPress={() => openTerritoryInMaps(territory, provider)}
                    testID='territory-directions'
                  />
                )}
                {canShare && (
                  <TerritoryPill
                    fill
                    dense
                    icon={UsersIcon}
                    label={
                      shareCount > 0
                        ? i18n.t('territories.share.actionCount', {
                            count: shareCount,
                          })
                        : i18n.t('territories.share.action')
                    }
                    onPress={() =>
                      navigation.navigate('TerritoryShare', { territoryId })
                    }
                    testID='territory-share'
                  />
                )}
              </View>
            )}
          </View>

          <TerritoryReceivedCard territory={territory} />

          {!finished && allWorked && owner && (
            <View style={{ gap: 10 }}>
              <Text
                testID='territory-all-worked'
                style={{
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('lg'),
                  paddingHorizontal: 5,
                }}
              >
                {i18n.t(
                  workState === 'allHandedOff'
                    ? 'territories.share.allHandedOff'
                    : 'territories.allWorked'
                )}
              </Text>
              {[
                {
                  label: i18n.t('territories.addAnotherStreet'),
                  onPress: () =>
                    navigation.navigate('TerritoryStreetForm', { territoryId }),
                  testID: 'territory-add-another-street',
                  main: false,
                },
                {
                  label: i18n.t('territories.finish'),
                  onPress: requestFinish,
                  testID: 'territory-primary',
                  main: true,
                },
              ].map((choice) => (
                <Button
                  key={choice.testID}
                  onPress={choice.onPress}
                  testID={choice.testID}
                  style={{
                    minHeight: 52,
                    paddingVertical: 12,
                    paddingHorizontal: 24,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 26,
                    borderWidth: choice.main ? 1.5 : 0,
                    borderColor: theme.colors.accent,
                    backgroundColor: choice.main
                      ? `${theme.colors.accent}1F`
                      : theme.colors.card,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: choice.main
                        ? theme.fonts.bold
                        : theme.fonts.semiBold,
                      fontSize: theme.fontSize('lg'),
                    }}
                  >
                    {choice.label}
                  </Text>
                </Button>
              ))}
              {returnCaption}
            </View>
          )}

          <TerritoryStreetsSection
            streets={territory.streets}
            people={territory.people}
            canAdd={owner}
            readOnly={finished}
            nextId={
              !finished && !allWorked && territory.streets.length > 1
                ? upNext?.id
                : undefined
            }
            onOpen={(street) => openStreet(street.id)}
            menu={(street) => streetMenu(territory, street)}
            onAdd={() =>
              navigation.navigate('TerritoryStreetForm', { territoryId })
            }
            onSuggest={
              canSuggest
                ? () =>
                    navigation.navigate('TerritoryStreetSuggest', {
                      territoryId,
                    })
                : undefined
            }
          />

          <TerritoryDoNotCallSection
            entries={doNotCalls}
            readOnly={finished}
            editable={finished ? owner : undefined}
            streets={territory.streets}
            copyable={finished}
            note={
              finished && doNotCalls.length > 0
                ? i18n.t('territories.doNotCalls_passOn')
                : undefined
            }
            onAdd={(entry) =>
              update(territoryId, (current) => ({
                ...current,
                doNotCalls: [
                  ...current.doNotCalls,
                  { ...entry, id: Crypto.randomUUID() },
                ],
              }))
            }
            onEdit={(entry) =>
              navigation.navigate('TerritoryDoNotCall', {
                territoryId,
                entryId: entry.id,
              })
            }
          />

          {!finished && !privacy && (
            <TerritoryNotHomeSection
              streets={workingStreets(territory)}
              onOpen={(street) =>
                navigation.navigate('TerritoryStreet', {
                  territoryId,
                  streetId: street.id,
                  notHomeOnly: true,
                })
              }
            />
          )}

          {(owner || heldStreetIds(territory).length > 0) && !finished && (
            <TerritorySharedWithSection
              territory={territory}
              onOpenLink={(shareId) =>
                navigation.navigate('TerritoryShareLink', {
                  territoryId,
                  shareId,
                })
              }
            />
          )}

          <TerritoryActions
            actions={[
              canAddNotes && {
                key: 'notes',
                icon: NotebookPenIcon,
                label: i18n.t('territories.notes.action'),
                sublabel: i18n.t('territories.notes.action_description'),
                onPress: () =>
                  navigation.navigate('TerritoryNotes', { territoryId }),
                testID: 'territory-add-from-notes',
              },
              canReturn && {
                key: 'return',
                icon: ArchiveIcon,
                label: i18n.t('territories.finish'),
                sublabel: i18n.t(
                  privacy
                    ? 'territories.finish_captionPrivacy'
                    : 'territories.finish_caption'
                ),
                onPress: requestFinish,
                testID: 'territory-finish',
              },
            ]}
          />

          {finished && (
            <View style={{ gap: 8 }}>
              <Button
                variant='solid'
                testID='territory-check-out-again'
                onPress={() => territoryActions.requestCheckOutAgain(territory)}
                style={{
                  minHeight: 48,
                  paddingVertical: 12,
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontFamily: theme.fonts.semiBold }}>
                  {i18n.t('territories.checkOutAgain')}
                </Text>
              </Button>
              {caption(i18n.t('territories.checkOutAgain_caption'))}
            </View>
          )}
        </ContentColumn>
      </KeyboardAwareScrollView>
    </View>
  )
}
