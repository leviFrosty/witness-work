import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, RefreshControl, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import {
  Circle as CircleIcon,
  ImageOff as ImageOffIcon,
  Trash2 as TrashIcon,
  UserX as UserXIcon,
} from 'lucide-react-native'
import Wrapper from '@/components/ui/layout/Wrapper'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import SettingsScrollView from '@/features/settings/components/shared/SettingsScrollView'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import SectionFooter from '@/features/settings/components/account/SectionFooter'
import LoadStatus from '@/features/settings/components/account/activity/LoadStatus'
import PhotoStorageBar, {
  PHOTO_STORAGE_LABEL,
  photoStorageColor,
} from '@/features/settings/components/sync/PhotoStorageBar'
import useCloudSyncPhotoStorage from '@/features/settings/hooks/useCloudSyncPhotoStorage'
import usePhotoStorageBreakdown from '@/features/settings/hooks/usePhotoStorageBreakdown'
import {
  PHOTO_STORAGE_CATEGORIES,
  deleteAllPhotos,
  emptyRecentlyDeletedPhotos,
  removeUnusedPhotos,
  type PhotoStorageBreakdown,
} from '@/app/sync/photoStorage'
import { refreshCloudSyncPhotoUsage } from '@/app/sync/cloudSync'
import { iCloudSync } from '@/app/sync/iCloudSync'
import { analytics } from '@/lib/analytics'
import { showAlert } from '@/lib/alert'
import { hasCapability } from '@/lib/platformCapabilities'
import { formatBytes } from '@/lib/formatBytes'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { toast } from '@/stores/toasts'

type Action = 'unused' | 'recentlyDeleted' | 'all'

const RUN: Record<
  Action,
  (breakdown: PhotoStorageBreakdown) => Promise<number>
> = {
  unused: () => removeUnusedPhotos(),
  recentlyDeleted: emptyRecentlyDeletedPhotos,
  all: deleteAllPhotos,
}

export default function PhotoStorageScreen() {
  const theme = useTheme()
  const focused = useIsFocused()
  const { shown, usage } = useCloudSyncPhotoStorage()
  const { breakdown, loading, failed, reload } = usePhotoStorageBreakdown(
    shown && focused
  )
  const [running, setRunning] = useState<Action | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const reported = useRef(false)

  useEffect(() => {
    if (!breakdown || reported.current) return
    reported.current = true
    analytics.capture('photo_storage_viewed', {
      percent_used: breakdown.limit
        ? Math.min(
            100,
            Math.round((breakdown.used / breakdown.limit) * 10) * 10
          )
        : 0,
      has_unused: breakdown.unusedFiles.length > 0,
      has_recently_deleted: breakdown.recentlyDeletedContactIds.length > 0,
    })
  }, [breakdown])

  const run = async (action: Action) => {
    if (!breakdown || running) return
    setRunning(action)
    try {
      const deleted = await RUN[action](breakdown)
      await iCloudSync.imageWorkSettled()
      const after = await refreshCloudSyncPhotoUsage()
      const freed = Math.max(deleted, after ? breakdown.used - after.bytes : 0)
      analytics.capture('photo_storage_cleaned', { action, outcome: 'done' })
      toast.success(
        freed > 0
          ? i18n.t('photoStorage_freed', { size: formatBytes(freed) })
          : i18n.t('photoStorage_freedLater')
      )
    } catch (error) {
      logger.warn(`[photoStorage] ${action} failed`, error)
      analytics.capture('photo_storage_cleaned', { action, outcome: 'failed' })
      toast.error(i18n.t('photoStorage_failed'))
    } finally {
      setRunning(null)
      void reload()
    }
  }

  const confirm = (
    action: Action,
    title: string,
    body: string,
    confirmLabel: string
  ) =>
    showAlert(title, body, [
      { text: i18n.t('cancel'), style: 'cancel' },
      {
        text: confirmLabel,
        style: 'destructive',
        onPress: () => void run(action),
      },
    ])

  if (!breakdown)
    return (
      <SettingsInputLayout>
        <Wrapper insets='bottom'>
          <SettingsScrollView contentContainerStyle={{ paddingTop: 30 }}>
            <LoadStatus
              loading={loading || !failed}
              message={failed ? i18n.t('photoStorage_loadFailed') : null}
              onRetry={() => void reload()}
            />
          </SettingsScrollView>
        </Wrapper>
      </SettingsInputLayout>
    )

  const { categories, used } = breakdown
  const limit = breakdown.limit || usage?.limit || 0
  const free = Math.max(0, limit - used)
  const unused = categories.unused
  const deletedCount = breakdown.recentlyDeletedContactIds.length
  const hasRecommendations = unused.count > 0 || deletedCount > 0
  const busy = running !== null

  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <SettingsScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                void reload().finally(() => setRefreshing(false))
              }}
              tintColor={theme.colors.accent}
            />
          }
        >
          <Card style={{ gap: 14 }}>
            <View style={{ gap: 2 }}>
              <Text
                testID='photo-storage-used'
                style={{
                  fontFamily: theme.fonts.bold,
                  fontSize: theme.fontSize('xl'),
                }}
              >
                {i18n.t('photoStorage_used', {
                  used: formatBytes(used),
                  limit: formatBytes(limit),
                })}
              </Text>
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  color: theme.colors.textAlt,
                }}
              >
                {i18n.t('photoStorage_available', { size: formatBytes(free) })}
              </Text>
            </View>
            <PhotoStorageBar
              categories={categories}
              used={used}
              limit={limit}
              height={22}
            />
          </Card>

          {busy && (
            <View
              style={{
                flexDirection: 'row',
                gap: 10,
                justifyContent: 'center',
              }}
            >
              <ActivityIndicator color={theme.colors.textAlt} />
              <Text style={{ color: theme.colors.textAlt }}>
                {i18n.t('photoStorage_working')}
              </Text>
            </View>
          )}

          {hasRecommendations && (
            <View style={{ gap: 5 }}>
              <SectionTitle
                text={i18n.t('photoStorage_recommendations')}
                alignWithIcons
              />
              <Section>
                {unused.count > 0 && (
                  <InputRowButton
                    leftIcon={ImageOffIcon}
                    label={i18n.t('photoStorage_removeUnused')}
                    sublabel={i18n.t('photoStorage_removeUnusedInfo', {
                      count: unused.count,
                    })}
                    disabled={busy}
                    testID='photo-storage-remove-unused'
                    onPress={() =>
                      confirm(
                        'unused',
                        i18n.t('photoStorage_removeUnusedConfirmTitle'),
                        i18n.t('photoStorage_removeUnusedConfirmBody'),
                        i18n.t('photoStorage_remove')
                      )
                    }
                    lastInSection={deletedCount === 0}
                  >
                    <SizeText bytes={unused.bytes} />
                  </InputRowButton>
                )}
                {deletedCount > 0 && (
                  <InputRowButton
                    leftIcon={UserXIcon}
                    label={i18n.t('photoStorage_emptyDeleted')}
                    sublabel={i18n.t('photoStorage_emptyDeletedInfo', {
                      count: deletedCount,
                    })}
                    disabled={busy}
                    testID='photo-storage-empty-deleted'
                    onPress={() =>
                      confirm(
                        'recentlyDeleted',
                        i18n.t('photoStorage_emptyDeletedConfirmTitle', {
                          count: deletedCount,
                        }),
                        i18n.t('photoStorage_emptyDeletedConfirmBody'),
                        i18n.t('delete')
                      )
                    }
                    lastInSection
                  >
                    <SizeText bytes={categories.recentlyDeleted.bytes} />
                  </InputRowButton>
                )}
              </Section>
            </View>
          )}

          <View style={{ gap: 5 }}>
            <SectionTitle
              text={i18n.t('photoStorage_breakdown')}
              alignWithIcons
            />
            <Section>
              {PHOTO_STORAGE_CATEGORIES.filter(
                (category) =>
                  categories[category].bytes > 0 ||
                  category === 'contacts' ||
                  category === 'notes'
              ).map((category, index, list) => (
                <InputRowButton
                  key={category}
                  testID={`photo-storage-row-${category}`}
                  leftIcon={CircleIcon}
                  leftIconColor={photoStorageColor(theme, category)}
                  leftIconFill={photoStorageColor(theme, category)}
                  label={i18n.t(PHOTO_STORAGE_LABEL[category])}
                  sublabel={i18n.t('photoStorage_photoCount', {
                    count: categories[category].count,
                  })}
                  lastInSection={index === list.length - 1}
                >
                  <SizeText bytes={categories[category].bytes} />
                </InputRowButton>
              ))}
            </Section>
          </View>

          {breakdown.files.length > 0 &&
            hasCapability('syncedAvatarPhotos') && (
              <View style={{ gap: 5 }}>
                <Section>
                  <InputRowButton
                    leftIcon={TrashIcon}
                    leftIconColor={theme.colors.error}
                    label={i18n.t('photoStorage_deleteAll')}
                    disabled={busy}
                    testID='photo-storage-delete-all'
                    onPress={() =>
                      confirm(
                        'all',
                        i18n.t('photoStorage_deleteAllConfirmTitle'),
                        i18n.t('photoStorage_deleteAllConfirmBody'),
                        i18n.t('photoStorage_deleteAll')
                      )
                    }
                    lastInSection
                  />
                </Section>
                <SectionFooter text={i18n.t('photoStorage_deleteAllInfo')} />
              </View>
            )}
        </SettingsScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

function SizeText({ bytes }: { bytes: number }) {
  const theme = useTheme()
  return (
    <Text style={{ color: theme.colors.textAlt }}>{formatBytes(bytes)}</Text>
  )
}
