import type { Ref } from 'react'
import { ActivityIndicator, Platform, type TextInput, View } from 'react-native'
import {
  ArrowUp as ArrowUpIcon,
  Camera as CameraIcon,
  Mic as MicIcon,
  Square as SquareIcon,
  TriangleAlert as TriangleAlertIcon,
} from 'lucide-react-native'
import { TextArea, type InputProps } from 'tamagui'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import PointerTooltip from '@/components/ui/PointerTooltip'
import PullDownMenu from '@/components/ui/PullDownMenu'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET, touchTargetFrame } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import {
  errorCopy,
  formatResetTime,
} from '@/features/scribe/components/scribeCopy'
import type {
  ScribePaperCapture,
  ScribePhotoCapture,
} from '@/features/scribe/types'

const FACE = 36

interface Props {
  inputRef: Ref<TextInput>
  value: string
  onChangeText: (value: string) => void
  onSend: () => void

  running: boolean
  onStop: () => void

  canSend: boolean

  onSpeak?: () => void
  photo: ScribePhotoCapture
  paper: ScribePaperCapture

  onCaptured: (text: string, source: 'photo' | 'paper') => void
}

const RoundIcon = ({
  icon,
  label,
  onPress,
  filled,
  disabled,
}: {
  icon: AppIcon
  label: string
  onPress: () => void
  filled?: boolean
  disabled?: boolean
}) => {
  const theme = useTheme()
  return (
    <PointerTooltip label={label} effect='none' placement='top'>
      <Button
        onPress={onPress}
        disabled={disabled}
        accessibilityRole='button'
        accessibilityLabel={label}
        pointerEffect='lift'
        style={touchTargetFrame(FACE)}
      >
        <View
          style={{
            width: FACE,
            height: FACE,
            borderRadius: FACE / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: filled
              ? disabled
                ? theme.colors.accentAlt
                : theme.colors.accent
              : theme.colors.backgroundLighter,
            borderWidth: filled ? 0 : 1,
            borderColor: theme.colors.border,
          }}
        >
          <LucideIcon
            icon={icon}
            size={filled ? 18 : 17}
            color={filled ? theme.colors.textInverse : theme.colors.text}
          />
        </View>
      </Button>
    </PointerTooltip>
  )
}

const CaptureButton = ({
  photo,
  paper,
  onCaptured,
}: Pick<Props, 'photo' | 'paper' | 'onCaptured'>) => {
  const theme = useTheme()
  const scan = async () => {
    paper.clearError()
    const text = await photo.capture()
    if (text) onCaptured(text, 'photo')
  }
  const read = async () => {
    const text = await paper.capture('library')
    if (text) onCaptured(text, 'paper')
  }
  const scanAvailable = photo.available && Platform.OS === 'ios'
  if (!scanAvailable && !paper.available) return null
  const label = i18n.t('scribe_captureMenu')

  if (!scanAvailable)
    return (
      <RoundIcon
        icon={CameraIcon}
        label={i18n.t('scribe_readPaper')}
        onPress={() => void read()}
      />
    )

  return (
    <PointerTooltip label={label} effect='none' placement='top'>
      <PullDownMenu
        accessibilityLabel={label}
        pointerEffect='highlight'
        actions={[
          {
            id: 'scan',
            title: i18n.t('scribe_scanNotes'),
            systemImage: 'doc.viewfinder',
            onPress: () => void scan(),
          },
          ...(paper.available
            ? [
                {
                  id: 'paper',
                  title: i18n.t('scribe_readPaper'),
                  systemImage: 'photo.on.rectangle' as const,
                  onPress: () => void read(),
                },
              ]
            : []),
        ]}
      >
        <View style={touchTargetFrame(FACE)}>
          <View
            style={{
              width: FACE,
              height: FACE,
              borderRadius: FACE / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.backgroundLighter,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <LucideIcon icon={CameraIcon} size={17} color={theme.colors.text} />
          </View>
        </View>
      </PullDownMenu>
    </PointerTooltip>
  )
}

const paperErrorCopy = ({
  error,
  retryAt,
}: Pick<ScribePaperCapture, 'error' | 'retryAt'>): string | null => {
  if (!error) return null
  if (error === 'page_limit')
    return retryAt
      ? i18n.t('scribe_paperPageLimit', { when: formatResetTime(retryAt) })
      : i18n.t('scribe_paperPageLimitLater')
  const key = errorCopy(error)
  return key ? i18n.t(key) : null
}

const WarningLine = ({ text }: { text: string }) => {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <LucideIcon
        icon={TriangleAlertIcon}
        size={14}
        color={theme.colors.warnText}
      />
      <Text
        style={{
          flex: 1,
          fontSize: theme.fontSize('sm'),
          color: theme.colors.warnText,
        }}
      >
        {text}
      </Text>
    </View>
  )
}

const PillButton = ({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) => {
  const theme = useTheme()
  return (
    <Button
      noTransform
      onPress={onPress}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        paddingHorizontal: 16,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.backgroundLighter,
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: theme.fontSize('sm') + 1,
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {label}
      </Text>
    </Button>
  )
}

const UnreadPages = ({
  paper,
  onCaptured,
}: Pick<Props, 'paper' | 'onCaptured'>) => {
  const { unread } = paper
  if (!unread) return null
  const retry = async () => {
    const text = await paper.retry()
    if (text) onCaptured(text, 'paper')
  }
  const skip = () => {
    const text = paper.skip()
    if (text) onCaptured(text, 'paper')
  }
  return (
    <View accessibilityLiveRegion='polite' style={{ gap: 8 }}>
      <WarningLine
        text={
          paperErrorCopy({ error: unread.reason, retryAt: null }) ??
          i18n.t('scribe_paperUnread' as TranslationKey, {
            count: unread.count,
            total: unread.total,
          })
        }
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <PillButton
          label={i18n.t('scribe_tryAgain')}
          onPress={() => void retry()}
        />
        <PillButton label={i18n.t('scribe_paperSkipUnread')} onPress={skip} />
      </View>
    </View>
  )
}

const ScribeComposer = ({
  inputRef,
  value,
  onChangeText,
  onSend,
  running,
  onStop,
  canSend,
  onSpeak,
  photo,
  paper,
  onCaptured,
}: Props) => {
  const theme = useTheme()
  const capturing = photo.busy || paper.busy
  const sendable = canSend && !capturing && value.trim().length > 0
  const paperError = capturing ? null : paperErrorCopy(paper)

  return (
    <View
      style={{
        flexShrink: 1,
        gap: 6,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 6,
        shadowOffset: { width: 0, height: 1 },
        shadowColor: theme.colors.shadow,
        shadowOpacity: theme.numbers.shadowOpacity,
      }}
    >
      <TextArea
        unstyled
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        disabled={capturing}
        multiline
        accessibilityLabel={i18n.t('scribe_composerPlaceholder')}
        placeholder={i18n.t('scribe_composerPlaceholder')}
        placeholderTextColor={
          theme.colors.textAlt as InputProps['placeholderTextColor']
        }
        textAlignVertical='top'
        style={{
          flexShrink: 1,
          minHeight: 44,
          maxHeight: 200,
          color: theme.colors.text,
          fontFamily: theme.fonts.regular,
          fontSize: theme.fontSize('md'),

          lineHeight: value ? 22 : undefined,
          paddingTop: 0,
          paddingBottom: 2,
        }}
      />
      {capturing ? null : paper.unread ? (
        <UnreadPages paper={paper} onCaptured={onCaptured} />
      ) : paperError ? (
        <View accessibilityLiveRegion='polite'>
          <WarningLine text={paperError} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {capturing ? (
            <>
              <ActivityIndicator size='small' color={theme.colors.textAlt} />
              {paper.progress ? (
                <Text
                  style={{
                    fontSize: theme.fontSize('sm'),
                    color: theme.colors.textAlt,
                  }}
                >
                  {i18n.t('scribe_paperReading', {
                    done: Math.min(
                      paper.progress.done + 1,
                      paper.progress.total
                    ),
                    total: paper.progress.total,
                  })}
                </Text>
              ) : null}
            </>
          ) : (
            <CaptureButton
              photo={photo}
              paper={paper}
              onCaptured={onCaptured}
            />
          )}
        </View>
        {onSpeak && !running ? (
          <RoundIcon
            icon={MicIcon}
            label={i18n.t('scribe_speak')}
            onPress={onSpeak}
            disabled={!canSend || capturing}
          />
        ) : null}
        {running ? (
          <RoundIcon
            icon={SquareIcon}
            label={i18n.t('scribe_stop')}
            onPress={onStop}
            filled
          />
        ) : (
          <RoundIcon
            icon={ArrowUpIcon}
            label={i18n.t('scribe_send')}
            onPress={onSend}
            filled
            disabled={!sendable}
          />
        )}
      </View>
    </View>
  )
}

export default ScribeComposer
