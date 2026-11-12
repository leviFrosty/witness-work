import { useEffect, useState } from 'react'
import { View } from 'react-native'
import * as Crypto from 'expo-crypto'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  MapPin as MapPinIcon,
  PenLine as PenLineIcon,
  QrCode as QrCodeIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import DateTimePicker from '@/components/ui/DateTimePicker'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import Section from '@/components/ui/inputs/Section'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import Header from '@/components/ui/layout/Header'
import KeyboardAwareScrollView from '@/components/ui/layout/KeyboardAwareScrollView'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useFormValidation from '@/hooks/useFormValidation'
import i18n from '@/lib/locales'
import { hasCapability } from '@/lib/platformCapabilities'
import { toast } from '@/stores/toasts'
import TerritoryHeaderSave from '@/features/territories/components/TerritoryHeaderSave'
import TerritoryCardPhotoRow from '@/features/territories/components/TerritoryCardPhotoRow'
import TerritoryLinkRow from '@/features/territories/components/TerritoryLinkRow'
import TerritoryLinkScanner from '@/features/territories/components/TerritoryLinkScanner'
import TerritoryMapEditor from '@/features/territories/components/TerritoryMapEditor'
import TerritoryMapRow from '@/features/territories/components/TerritoryMapRow'
import TerritoryOutlineEditor from '@/features/territories/components/TerritoryOutlineEditor'
import TerritoryPinEditor from '@/features/territories/components/TerritoryPinEditor'
import TerritorySectionTitle from '@/features/territories/components/TerritorySectionTitle'
import useTerritoryActions from '@/features/territories/hooks/useTerritoryActions'
import { returnBy } from '@/features/territories/lib/doors'
import {
  areaCentroid,
  isOutline,
} from '@/features/territories/lib/territoryArea'
import {
  deleteCardPhoto,
  saveCardPhoto,
} from '@/features/territories/lib/cardPhoto'
import {
  coordinateFromLink,
  isShortMapLink,
  linkFromText,
  resolveLinkCoordinate,
} from '@/features/territories/lib/territoryLink'
import {
  useTerritories,
  useTerritory,
} from '@/features/territories/stores/territories'
import type { Coordinate } from '@/types/contact'
import type { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<RootStackParamList, 'TerritoryForm'>

type Pin = { coordinate: Coordinate; source: 'link' | 'manual' }

type MapEditor = 'pin' | 'outline'

export default function TerritoryFormScreen(props: Props) {
  return <TerritoryForm key={props.route.params?.territoryId} {...props} />
}

function TerritoryForm({ route, navigation }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const existing = useTerritory(route.params?.territoryId)
  const editing = route.params?.territoryId !== undefined
  const save = useTerritories((state) => state.save)
  const territoryActions = useTerritoryActions()

  const gone = editing && !existing
  const returned = existing?.finishedAt !== undefined
  useEffect(() => {
    if (gone) navigation.popTo('Root', { screen: 'Territories' } as never)
  }, [gone, navigation])

  const [number, setNumber] = useState(existing?.number ?? '')
  const [name, setName] = useState(existing?.name ?? '')
  const [link, setLink] = useState(existing?.link ?? '')
  const [pin, setPin] = useState<Pin | undefined>(
    existing?.coordinate && {
      coordinate: existing.coordinate,
      source: 'manual',
    }
  )
  const [photo, setPhoto] = useState(existing?.photo)
  const [outline, setOutline] = useState<Coordinate[]>(existing?.outline ?? [])
  const [checkedOut, setCheckedOut] = useState(
    () => new Date(existing?.checkedOutAt ?? Date.now())
  )
  const [due, setDue] = useState<Date | undefined>(
    existing?.returnBy === undefined ? undefined : new Date(existing.returnBy)
  )
  const [editor, setEditor] = useState<MapEditor | null>(null)
  const [scanning, setScanning] = useState(false)
  const [finding, setFinding] = useState(false)

  const validation = useFormValidation({ number: !number.trim() }, 'territory')

  const locate = async (text: string) => {
    const url = linkFromText(text) ?? text.trim()
    if (!url || pin?.source === 'manual') return
    const direct = coordinateFromLink(url)
    if (direct) return setPin({ coordinate: direct, source: 'link' })
    if (!isShortMapLink(url)) return
    setFinding(true)
    const found = await resolveLinkCoordinate(url)
    setFinding(false)
    if (found)
      setPin((current) =>
        current?.source === 'manual'
          ? current
          : { coordinate: found, source: 'link' }
      )
  }

  const scanned = (data: string) => {
    setScanning(false)
    const url = linkFromText(data)
    if (!url) {
      toast.error(i18n.t('territories.scanNoLink'))
      return
    }
    setLink(url)
    void locate(url)
  }

  const pickPhoto = async (uri: string) => {
    try {
      setPhoto(await saveCardPhoto(uri, existing?.id ?? 'new'))
    } catch {
      toast.error(i18n.t('territories.photoFailed'))
    }
  }

  const closeEditor = () => setEditor(null)

  const submit = () => {
    if (!validation.validate()) return
    const id = existing?.id ?? Crypto.randomUUID()
    const now = Date.now()
    if (existing?.photo && existing.photo !== photo)
      void deleteCardPhoto(existing.photo)
    save({
      ...existing,
      id,
      number: number.trim(),
      name: name.trim() || undefined,
      link: (linkFromText(link) ?? link.trim()) || undefined,
      coordinate: pin?.coordinate,
      outline: isOutline(outline) ? outline : undefined,
      photo,
      checkedOutAt: checkedOut.getTime(),
      returnBy: due?.getTime(),
      finishedAt: existing?.finishedAt,
      streets: existing?.streets ?? [],
      doNotCalls: existing?.doNotCalls ?? [],
      createdAt: existing?.createdAt ?? now,
    })
    if (existing) navigation.goBack()
    else navigation.replace('TerritoryDetails', { territoryId: id })
  }

  const requestDelete = () =>
    existing && territoryActions.requestDelete(existing)

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        buttonType='back'
        title={i18n.t(editing ? 'territories.editTitle' : 'territories.add')}
        rightElement={
          <TerritoryHeaderSave onPress={submit} testID='territory-save' />
        }
      />
      <KeyboardAwareScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps='handled'
      >
        <ContentColumn
          style={{
            paddingTop: 20,
            paddingBottom: insets.bottom + 30,
            paddingHorizontal: inputLayout.horizontalPadding,
            gap: 24,
          }}
        >
          <Section>
            <TextInputRow
              label={i18n.t('territories.number')}
              required
              textInputProps={{
                invalid: validation.invalid('number'),
                value: number,
                onChangeText: setNumber,
                autoFocus: !existing,
                autoCapitalize: 'characters',
                maxLength: 20,
                testID: 'territory-number',
              }}
            />
            <TextInputRow
              label={i18n.t('territories.area')}
              textInputProps={{
                value: name,
                onChangeText: setName,
                placeholder: i18n.t('territories.optional'),
                maxLength: 60,
                testID: 'territory-area',
              }}
              lastInSection={returned}
            />
            {!returned && (
              <>
                <InputRowContainer
                  label={i18n.t('territories.checkedOutDate')}
                  controlStyle={{ alignItems: 'flex-end' }}
                >
                  <DateTimePicker
                    value={checkedOut}
                    maximumDate={new Date()}
                    onChange={(_event, picked) =>
                      picked && setCheckedOut(picked)
                    }
                  />
                </InputRowContainer>
                <InputRowContainer
                  label={i18n.t('territories.returnByDate')}
                  info={i18n.t('territories.returnByDate_info')}
                  controlStyle={{ alignItems: 'flex-end' }}
                  lastInSection
                >
                  <DateTimePicker
                    value={due ?? returnBy(checkedOut.getTime())}
                    minimumDate={checkedOut}
                    onChange={(_event, picked) => picked && setDue(picked)}
                  />
                </InputRowContainer>
              </>
            )}
          </Section>

          {!existing && (
            <Text
              style={{
                color: theme.colors.textAlt,
                paddingHorizontal: 5,
                marginTop: -12,
              }}
            >
              {i18n.t('territories.streetsNext')}
            </Text>
          )}

          <View style={{ gap: 8 }}>
            <TerritorySectionTitle>
              {i18n.t('territories.link')}
            </TerritorySectionTitle>
            <Section>
              {hasCapability('camera') && (
                <TerritoryMapRow
                  icon={QrCodeIcon}
                  label={i18n.t(
                    scanning ? 'territories.scanStop' : 'territories.scan'
                  )}
                  sublabel={i18n.t('territories.map.scan_description')}
                  done={false}
                  opens={scanning ? 'expanded' : 'collapsed'}
                  onPress={() => setScanning((value) => !value)}
                  testID='territory-scan-row'
                />
              )}
              {scanning && <TerritoryLinkScanner onRead={scanned} />}
              <TerritoryLinkRow
                link={link}
                finding={finding}
                onChange={setLink}
                onEntered={(entered) => void locate(entered)}
              />
              <TerritoryMapRow
                icon={MapPinIcon}
                label={i18n.t('territories.placeOnMap')}
                sublabel={i18n.t('territories.placeOnMap_description')}
                done={!!pin}
                opens='screen'
                onPress={() => setEditor('pin')}
                testID='territory-pin-row'
              />
              <TerritoryMapRow
                icon={PenLineIcon}
                label={i18n.t('territories.map.outline')}
                sublabel={i18n.t('territories.map.outline_description')}
                done={isOutline(outline)}
                value={
                  outline.length > 0
                    ? i18n.t('territories.map.cornerCount', {
                        count: outline.length,
                      })
                    : undefined
                }
                opens='screen'
                onPress={() => setEditor('outline')}
                testID='territory-outline-row'
              />
              <TerritoryCardPhotoRow
                photo={photo}
                onPick={(uri) => void pickPhoto(uri)}
                onRemove={() => setPhoto(undefined)}
              />
            </Section>
          </View>

          {existing && (
            <Button
              onPress={requestDelete}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text
                style={{
                  textAlign: 'center',
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.error,
                }}
              >
                {i18n.t('territories.delete')}
              </Text>
            </Button>
          )}
        </ContentColumn>
      </KeyboardAwareScrollView>
      <TerritoryMapEditor visible={editor === 'pin'} onClose={closeEditor}>
        <TerritoryPinEditor
          pin={pin?.coordinate}
          fromLink={pin?.source === 'link'}
          around={isOutline(outline) ? areaCentroid(outline) : undefined}
          onClose={closeEditor}
          onDone={(coordinate) => {
            if (coordinate !== pin?.coordinate)
              setPin(coordinate && { coordinate, source: 'manual' })
            closeEditor()
          }}
        />
      </TerritoryMapEditor>
      <TerritoryMapEditor visible={editor === 'outline'} onClose={closeEditor}>
        <TerritoryOutlineEditor
          outline={outline}
          pin={pin?.coordinate}
          onClose={closeEditor}
          onDone={(next) => {
            setOutline(next)
            closeEditor()
          }}
        />
      </TerritoryMapEditor>
    </View>
  )
}
