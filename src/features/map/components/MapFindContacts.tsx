import {
  Check as CheckIcon,
  MapPinned as MapPinnedIcon,
  X as XIcon,
} from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { Alert, View, type ViewStyle } from 'react-native'
import { isLiquidGlassAvailable } from 'expo-glass-effect'

import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PointerTooltip from '@/components/ui/PointerTooltip'
import Spinner from '@/components/ui/Spinner'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import { isKnownOffline } from '@/lib/http/online'
import i18n from '@/lib/locales'
import useContacts from '@/stores/contactsStore'
import { usePreferences } from '@/stores/preferences'
import {
  contactsToFind,
  countBucket,
  geocodeContacts,
  pinLookupKey,
} from '@/features/map/lib/geocodeContacts'
import {
  skipPinLookups,
  useMapFindSkips,
} from '@/features/map/stores/mapFindSkips'

const liquidGlass = isLiquidGlassAvailable()
const RESULT_VISIBLE_MS = 4000

const alertOffline = () =>
  Alert.alert(
    i18n.t('internetUnavailable'),
    i18n.t('couldNotFetchCoordinatesFromAddress')
  )

export default function MapFindContacts({
  hidden,
  onFound,
}: {
  hidden?: boolean

  onFound: () => void
}) {
  const theme = useTheme()
  const contacts = useContacts((s) => s.contacts)
  const skipped = useMapFindSkips((s) => s.skipped)
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)
  const incrementGeocodeApiCallCount = usePreferences(
    (s) => s.incrementGeocodeApiCallCount
  )
  const [progress, setProgress] = useState<{
    done: number
    total: number
  } | null>(null)
  const [result, setResult] = useState<{
    found: number
    total: number
  } | null>(null)
  const controller = useRef<AbortController | null>(null)

  const toFind = dataProtectionMode
    ? []
    : contactsToFind(contacts, new Set(skipped))

  useEffect(() => () => controller.current?.abort(), [])

  useEffect(() => {
    if (!result) return
    const timer = setTimeout(() => setResult(null), RESULT_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [result])

  const find = async () => {
    if (isKnownOffline()) {
      alertOffline()
      return
    }
    const batch = toFind
    const run = new AbortController()
    controller.current = run
    setResult(null)
    setProgress({ done: 0, total: batch.length })
    let found = 0
    const notFound: string[] = []
    const { wentOffline } = await geocodeContacts(batch, {
      controller: run,
      incrementGeocodeApiCallCount,
      onResult: (contact, outcome) => {
        if (outcome === 'found') found += 1
        if (outcome === 'notFound') notFound.push(pinLookupKey(contact))
        setProgress((p) => p && { ...p, done: p.done + 1 })
      },
    })
    if (controller.current === run) controller.current = null
    const cancelled = run.signal.aborted && !wentOffline

    if (notFound.length > 0) skipPinLookups(notFound)
    analytics.capture('map_find_contacts_result', {
      outcome: wentOffline ? 'offline' : cancelled ? 'cancelled' : 'completed',
      count: countBucket(batch.length),
      found: countBucket(found),
    })
    setProgress(null)
    if (found > 0) onFound()
    if (wentOffline) alertOffline()
    else if (!cancelled) setResult({ found, total: batch.length })
  }

  const cancel = () => controller.current?.abort()

  const hide = () => skipPinLookups(toFind.map(pinLookupKey))

  if (hidden) return null

  const pillStyle: ViewStyle = {
    height: 44,
    borderRadius: 22,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingVertical: 0,
    gap: 8,
    flexShrink: 1,
    backgroundColor: liquidGlass ? undefined : theme.colors.card + 'dd',
  }

  const closeButton = (label: string, onPress: () => void) => (
    <PointerTooltip
      label={label}
      placement='bottom'
      style={{ borderRadius: 22 }}
    >
      <Button
        variant='glass'
        accessibilityLabel={label}
        onPress={onPress}
        style={{
          ...pillStyle,
          width: 44,
          paddingHorizontal: 0,
          justifyContent: 'center',
        }}
      >
        <LucideIcon
          icon={XIcon}
          size={theme.fontSize('sm')}
          color={theme.colors.text}
        />
      </Button>
    </PointerTooltip>
  )

  const label = (text: string) => (
    <Text
      numberOfLines={1}
      style={{
        flexShrink: 1,
        fontSize: theme.fontSize('sm'),
        fontFamily: theme.fonts.semiBold,
        color: theme.colors.text,
      }}
    >
      {text}
    </Text>
  )

  const icon = (icon: AppIcon) => (
    <LucideIcon
      icon={icon}
      size={theme.fontSize('sm')}
      color={theme.colors.accent}
    />
  )

  if (progress) {
    return (
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          variant='glass'
          disabled
          accessibilityRole='text'
          accessibilityLiveRegion='polite'
          style={pillStyle}
        >
          <Spinner size='small' color={theme.colors.accent} />
          {label(
            i18n.t('map_findContacts_progress', {
              done: progress.done,
              total: progress.total,
            })
          )}
        </Button>
        {closeButton(i18n.t('cancel'), cancel)}
      </View>
    )
  }

  if (result) {
    return (
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          variant='glass'
          disabled
          accessibilityRole='text'
          accessibilityLiveRegion='polite'
          style={pillStyle}
        >
          {icon(CheckIcon)}
          {label(
            i18n.t('map_findContacts_result', {
              found: result.found,
              total: result.total,
            })
          )}
        </Button>
        {closeButton(i18n.t('close'), () => setResult(null))}
      </View>
    )
  }

  if (toFind.length === 0) return null

  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Button variant='glass' onPress={find} style={pillStyle}>
        {icon(MapPinnedIcon)}
        {label(i18n.t('map_findContacts', { count: toFind.length }))}
      </Button>
      {closeButton(i18n.t('hide'), hide)}
    </View>
  )
}
