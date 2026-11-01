import { useState } from 'react'
import { FlatList, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image as ImageIcon, X as XIcon } from 'lucide-react-native'
import type { ImagePickerAsset } from 'expo-image-picker'
import { presentPermissionsPicker } from 'expo-media-library'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Empty from '@/components/ui/Empty'
import IconButton from '@/components/ui/IconButton'
import InlineNotice from '@/components/ui/InlineNotice'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Spinner from '@/components/ui/Spinner'
import SharedPhotoCell from '@/components/limitedPhotoPicker/SharedPhotoCell'
import useSharedPhotos from '@/components/limitedPhotoPicker/useSharedPhotos'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { copyLibraryPhoto } from '@/lib/photoLibrary/copyLibraryPhoto'
import type { SharedPhotoRequest } from '@/lib/photoLibrary/pickLibraryImages'

const GAP = 2

const CELL_TARGET = 110
const MIN_COLUMNS = 3

type Props = {
  request: SharedPhotoRequest
  onCancel: () => void
  onPicked: (assets: ImagePickerAsset[]) => void

  onManage: () => void

  onFailed: () => void
}

export default function LimitedPhotoPicker({
  request,
  onCancel,
  onPicked,
  onManage,
  onFailed,
}: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const photos = useSharedPhotos()
  const [width, setWidth] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [copying, setCopying] = useState(false)
  const [failed, setFailed] = useState(false)

  const single = request.selectionLimit === 1
  const columns = Math.max(
    MIN_COLUMNS,
    Math.floor((width + GAP) / (CELL_TARGET + GAP))
  )
  const cellSize = width ? (width - GAP * (columns - 1)) / columns : 0

  const shared = new Set(photos?.map((photo) => photo.id))
  const picked = selected.filter((id) => shared.has(id))

  const manage = () => {
    onManage()
    presentPermissionsPicker(['photo']).catch((error: unknown) =>
      logger.warn('[photoPicker] Manage failed to open', error)
    )
  }

  const finish = async (ids: string[]) => {
    if (!ids.length || copying) return
    setCopying(true)
    setFailed(false)
    try {
      const assets = []
      for (const id of ids)
        assets.push(await copyLibraryPhoto(id, { exif: request.exif }))
      onPicked(assets)
    } catch (error) {
      logger.error('[photoPicker] Failed to copy a shared photo', error)
      setFailed(true)
      onFailed()
      void Haptics.error()
    } finally {
      setCopying(false)
    }
  }

  const toggle = (id: string) => {
    if (single) {
      void finish([id])
      return
    }
    void Haptics.selection()
    setSelected((current) =>
      current.includes(id)
        ? current.filter((other) => other !== id)
        : current.length < request.selectionLimit
          ? [...current, id]
          : current
    )
  }

  const empty = photos !== null && photos.length === 0

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.sheet }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 6,
          paddingTop: 8,
          minHeight: 56,
        }}
      >
        <View style={{ flex: 1, alignItems: 'flex-start' }}>
          <IconButton
            icon={XIcon}
            size={20}
            onPress={onCancel}
            accessibilityLabel={i18n.t('close')}
            style={{
              width: 44,
              height: 44,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          />
        </View>
        <Text
          accessibilityRole='header'
          numberOfLines={1}
          style={{
            fontSize: 17,
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.text,
          }}
        >
          {i18n.t(single ? 'photoPicker_titleOne' : 'photoPicker_titleMany')}
        </Text>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          {!single && (
            <Button
              onPress={() => void finish(picked)}
              disabled={!picked.length || copying}
              accessibilityLabel={
                picked.length
                  ? i18n.t('photoPicker_addCount', { count: picked.length })
                  : i18n.t('add')
              }
              style={{
                minHeight: 44,
                paddingHorizontal: 10,
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: 17,
                  fontFamily: theme.fonts.semiBold,
                  color: picked.length
                    ? theme.colors.accent
                    : theme.colors.textAlt,
                }}
              >
                {picked.length
                  ? i18n.t('photoPicker_addCount', { count: picked.length })
                  : i18n.t('add')}
              </Text>
            </Button>
          )}
        </View>
      </View>
      {!empty && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingLeft: 16,
            paddingRight: 6,
            paddingBottom: 8,
          }}
        >
          <Text
            style={{
              flex: 1,
              fontSize: 13,
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('photoPicker_sharedOnly')}
          </Text>
          <Button
            onPress={manage}
            accessibilityHint={i18n.t('photoPicker_manageHint')}
            style={{
              minHeight: 44,
              paddingHorizontal: 10,
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.accent,
              }}
            >
              {i18n.t('photoPicker_manage')}
            </Text>
          </Button>
        </View>
      )}
      {failed && (
        <InlineNotice
          message={i18n.t('photoPicker_loadFailed')}
          style={{ marginHorizontal: 16, marginBottom: 8 }}
        />
      )}
      <View
        style={{ flex: 1 }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {photos === null ? null : empty ? (
          <Empty
            icon={<LucideIcon icon={ImageIcon} size={24} />}
            title={i18n.t('photoPicker_emptyTitle')}
            description={i18n.t('photoPicker_emptyDescription')}
            action={
              <ActionButton onPress={manage}>
                {i18n.t('photoPicker_choosePhotos')}
              </ActionButton>
            }
            style={{ flex: 1, paddingBottom: insets.bottom }}
          />
        ) : cellSize > 0 ? (
          <FlatList
            key={columns}
            data={photos}
            keyExtractor={(photo) => photo.id}
            numColumns={columns}
            columnWrapperStyle={columns > 1 ? { gap: GAP } : undefined}
            contentContainerStyle={{ gap: GAP, paddingBottom: insets.bottom }}
            renderItem={({ item }) => {
              const index = picked.indexOf(item.id)
              return (
                <SharedPhotoCell
                  photo={item}
                  size={cellSize}
                  order={index === -1 ? null : index + 1}
                  single={single}
                  disabled={
                    copying ||
                    (!single &&
                      index === -1 &&
                      picked.length >= request.selectionLimit)
                  }
                  onPress={() => toggle(item.id)}
                />
              )
            }}
          />
        ) : null}
      </View>
      {copying && (
        <View
          accessibilityLiveRegion='polite'
          accessibilityLabel={i18n.t('photoPicker_loading')}
          style={{
            position: 'absolute',
            inset: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.sheet + 'B3',
          }}
        >
          <Spinner size='large' />
        </View>
      )}
    </View>
  )
}
