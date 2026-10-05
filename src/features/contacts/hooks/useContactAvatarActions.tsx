import * as Crypto from 'expo-crypto'
import { useEffect, useState } from 'react'
import { Alert, Image as RNImage } from 'react-native'
import { shareAsync } from 'expo-sharing'
import * as MediaLibrary from 'expo-media-library'
import Haptics from '@/lib/haptics'
import * as FileSystem from 'expo-file-system/legacy'
import { useToastController } from '@tamagui/toast'

import ContactAvatarCropEditor from '@/components/ContactAvatarCropEditor'
import {
  cropAndSaveAvatar,
  croppedAvatarPath,
  defaultCenteredSquareCrop,
  originalAvatarPath,
  originalExists,
  stripCacheBuster,
  withCacheBuster,
} from '@/lib/contactAvatarFiles'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import useContacts from '@/stores/contactsStore'
import type { Contact } from '@/types/contact'
import { useAvatarDraftFiles } from '@/hooks/useAvatarDraftFiles'

type Dims = { width: number; height: number }

/**
 * A Contact photo's actions — edit the crop, save to Photos, share, reset the
 * crop — shared by the full-screen viewer's toolbar and the avatar's context
 * menu. Render `editor` wherever the crop editor should present from (inside
 * the viewer's Modal, or beside the avatar).
 *
 * `enabled` gates the check for a saved original, which Reset and the editor's
 * full-quality source depend on.
 */
export default function useContactAvatarActions(
  contact: Contact,
  enabled: boolean
) {
  const updateContact = useContacts((s) => s.updateContact)
  const toast = useToastController()
  const draftFiles = useAvatarDraftFiles()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editSource, setEditSource] = useState<{
    uri: string
    width: number
    height: number
    revision: string
    avatarMeta: Contact['avatarMeta']
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [hasOriginal, setHasOriginal] = useState(false)
  const [editableDims, setEditableDims] = useState<Dims | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setHasOriginal(false)
    setEditableDims(null)
    originalExists(contact.id, contact.avatar?.revision).then((exists) => {
      if (!cancelled) setHasOriginal(exists)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, contact.id, contact.avatar?.value, contact.avatar?.revision])

  const displayedUri = contact.avatar?.value
  // The crop editor prefers the locally-saved original (full quality) and
  // falls back to the displayed image when no original exists (legacy
  // contacts).
  const editableSource = hasOriginal
    ? {
        uri: originalAvatarPath(contact.id, contact.avatar?.revision),
        isOriginal: true,
      }
    : displayedUri
      ? { uri: stripCacheBuster(displayedUri), isOriginal: false }
      : null

  // Probe pixel dimensions of the editable source when the user opens the
  // editor. Avatar metadata gives us the original's dimensions; for the
  // fallback (cropped image) we ask the image loader at edit time.
  const ensureEditableDims = async (): Promise<Dims | null> => {
    if (editableDims) return editableDims
    if (!editableSource) return null
    if (editableSource.isOriginal && contact.avatarMeta) {
      const d = {
        width: contact.avatarMeta.width,
        height: contact.avatarMeta.height,
      }
      setEditableDims(d)
      return d
    }
    return new Promise((resolve) => {
      RNImage.getSize(
        editableSource.uri,
        (width, height) => {
          const d = { width, height }
          setEditableDims(d)
          resolve(d)
        },
        () => resolve(null)
      )
    })
  }

  const edit = async () => {
    Haptics.selection().catch(() => {})
    const d = await ensureEditableDims()
    if (!d || !editableSource) {
      Alert.alert(i18n.t('error'), i18n.t('avatarSaveFailed'))
      return
    }
    const revision = Crypto.randomUUID()
    const uri = originalAvatarPath(contact.id, revision)
    const paths = [uri, croppedAvatarPath(contact.id, revision)]
    if (!draftFiles.claim(paths)) return
    try {
      // The editor owns this source until it commits or is cancelled. A remote
      // replacement can safely remove the previously saved photo meanwhile.
      await FileSystem.copyAsync({ from: editableSource.uri, to: uri })
      if (!draftFiles.owns(paths)) {
        draftFiles.release(paths)
        return
      }
      setEditSource({
        uri,
        ...d,
        revision,
        avatarMeta: {
          ...contact.avatarMeta,
          ...d,
          fileSize: editableSource.isOriginal
            ? contact.avatarMeta?.fileSize
            : undefined,
        },
      })
      setEditorOpen(true)
    } catch (error) {
      draftFiles.release(paths)
      logger.error('Failed to preserve crop source', error)
      Alert.alert(i18n.t('error'), i18n.t('avatarSaveFailed'))
    }
  }

  const save = async () => {
    if (!displayedUri || busy) return
    setBusy(true)
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true)
      if (!perm.granted) {
        Alert.alert(
          i18n.t('permissionRequired'),
          i18n.t('photoLibraryWritePermissionNeeded')
        )
        return
      }
      await MediaLibrary.saveToLibraryAsync(stripCacheBuster(displayedUri))
      Haptics.success().catch(() => {})
      toast.show(i18n.t('success'), {
        message: i18n.t('savedToPhotos'),
        native: true,
      })
    } catch (e) {
      logger.error('Failed to save avatar to photos', e)
      Alert.alert(i18n.t('error'), i18n.t('savePhotoFailed'))
    } finally {
      setBusy(false)
    }
  }

  const share = async () => {
    if (!displayedUri) return
    Haptics.selection().catch(() => {})
    try {
      await shareAsync(stripCacheBuster(displayedUri), {
        dialogTitle: contact.name,
      })
    } catch (e) {
      logger.warn('Share avatar failed or was cancelled', e)
    }
  }

  const reset = () => {
    if (busy) return
    Alert.alert(
      i18n.t('resetPhoto_question'),
      i18n.t('resetPhoto_description'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('reset'),
          onPress: async () => {
            setBusy(true)
            try {
              const exists = await originalExists(
                contact.id,
                contact.avatar?.revision
              )
              if (!exists || !contact.avatarMeta) {
                Alert.alert(i18n.t('error'), i18n.t('originalUnavailable'))
                return
              }
              const sourcePath = originalAvatarPath(
                contact.id,
                contact.avatar?.revision
              )
              const source = {
                width: contact.avatarMeta.width,
                height: contact.avatarMeta.height,
              }
              const rect = defaultCenteredSquareCrop(source)
              const revision = Crypto.randomUUID()
              const nextOriginal = originalAvatarPath(contact.id, revision)
              await FileSystem.copyAsync({ from: sourcePath, to: nextOriginal })
              const result = await cropAndSaveAvatar(
                nextOriginal,
                contact.id,
                rect,
                source,
                revision
              )
              updateContact({
                id: contact.id,
                avatar: {
                  type: 'image',
                  revision,
                  value: withCacheBuster(result.path),
                },
                avatarMeta: {
                  ...contact.avatarMeta,
                  croppedAt: new Date().toISOString(),
                },
              })
              Haptics.success().catch(() => {})
            } catch (e) {
              logger.error('Failed to reset crop', e)
              Alert.alert(i18n.t('error'), i18n.t('avatarSaveFailed'))
            } finally {
              setBusy(false)
            }
          },
        },
      ]
    )
  }

  const handleCropped = (next: {
    path: string
    width: number
    height: number
  }) => {
    if (!editSource) return
    if (!draftFiles.commit([editSource.uri, stripCacheBuster(next.path)]))
      return
    updateContact({
      id: contact.id,
      avatar: {
        type: 'image',
        revision: editSource.revision,
        value: next.path,
      },
      avatarMeta: editSource.avatarMeta
        ? {
            ...editSource.avatarMeta,
            croppedAt: new Date().toISOString(),
          }
        : undefined,
    })
    setEditorOpen(false)
  }

  const editor = editSource ? (
    <ContactAvatarCropEditor
      visible={editorOpen}
      sourceUri={editSource.uri}
      sourceWidth={editSource.width}
      sourceHeight={editSource.height}
      destPath={croppedAvatarPath(contact.id, editSource.revision)}
      onClose={() => {
        draftFiles.release([
          editSource.uri,
          croppedAvatarPath(contact.id, editSource.revision),
        ])
        setEditorOpen(false)
      }}
      onCropped={handleCropped}
    />
  ) : null

  return { busy, hasOriginal, edit, save, share, reset, editor }
}
