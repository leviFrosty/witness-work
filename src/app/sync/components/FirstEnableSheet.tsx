import React from 'react'
import { Alert, View } from 'react-native'
import { Sheet, XStack } from 'tamagui'
import {
  faCloudArrowDown,
  faCloudArrowUp,
  faShuffle,
  faTimes,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Text from '@/components/ui/MyText'
import IconButton from '@/components/ui/IconButton'
import Button from '@/components/ui/Button'
import { SyncPayload } from '@/app/sync/payload'

export type FirstEnableChoice = 'keepLocal' | 'useRemote' | 'merge'

interface Props {
  open: boolean
  setOpen: (open: boolean) => void
  remote: SyncPayload | null
  onChoose: (choice: FirstEnableChoice) => void
}

/**
 * Shown when the user toggles iCloud Sync on and we detect that BOTH this
 * device and iCloud already hold user data. Forces a conscious choice instead
 * of silently letting last-writer-wins overwrite the user's
 * carefully-configured device.
 */
const FirstEnableSheet: React.FC<Props> = ({
  open,
  setOpen,
  remote,
  onChoose,
}) => {
  const theme = useTheme()

  const remoteSummary = remote
    ? i18n.t('iCloudFoundBackupSummary', {
        device: remote.deviceName || i18n.t('iCloudAnotherDevice'),
        relative: moment(remote.writtenAt).fromNow(),
      })
    : ''

  const confirmUseRemote = () => {
    Alert.alert(
      i18n.t('iCloudReplaceLocalConfirm_title'),
      i18n.t('iCloudReplaceLocalConfirm_description'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('iCloudReplaceLocalConfirm_action'),
          style: 'destructive',
          onPress: () => {
            setOpen(false)
            onChoose('useRemote')
          },
        },
      ]
    )
  }

  return (
    <Sheet
      open={open}
      modal
      snapPoints={[85]}
      onOpenChange={setOpen}
      dismissOnSnapToBottom
      animation='quick'
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        <XStack ai='center' jc='space-between' px={20} pt={20} pb={10}>
          <Text
            style={{
              fontSize: theme.fontSize('xl'),
              color: theme.colors.text,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('iCloudFirstEnableTitle')}
          </Text>
          <IconButton
            noTransform
            onPress={() => setOpen(false)}
            size={20}
            icon={faTimes}
            color={theme.colors.text}
          />
        </XStack>

        <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              lineHeight: 20,
            }}
          >
            {remoteSummary
              ? `${i18n.t('iCloudFirstEnableDescription')} ${remoteSummary}`
              : i18n.t('iCloudFirstEnableDescription')}
          </Text>
        </View>

        <Sheet.ScrollView
          contentContainerStyle={{ paddingTop: 10, paddingBottom: 60 }}
        >
          <View style={{ gap: 12, paddingHorizontal: 20 }}>
            <ChoiceCard
              icon={faCloudArrowUp}
              iconColor={theme.colors.accent}
              title={i18n.t('iCloudChoiceKeepLocalTitle')}
              description={i18n.t('iCloudChoiceKeepLocalDesc')}
              onPress={() => {
                setOpen(false)
                onChoose('keepLocal')
              }}
            />
            <ChoiceCard
              icon={faCloudArrowDown}
              iconColor={theme.colors.error}
              title={i18n.t('iCloudChoiceUseRemoteTitle')}
              description={i18n.t('iCloudChoiceUseRemoteDesc')}
              destructive
              onPress={confirmUseRemote}
            />
            <ChoiceCard
              icon={faShuffle}
              iconColor={theme.colors.textAlt}
              title={i18n.t('iCloudChoiceMergeTitle')}
              description={i18n.t('iCloudChoiceMergeDesc')}
              onPress={() => {
                setOpen(false)
                onChoose('merge')
              }}
            />
          </View>
        </Sheet.ScrollView>
      </Sheet.Frame>
    </Sheet>
  )
}

interface ChoiceCardProps {
  icon: typeof faCloudArrowUp
  iconColor: string
  title: string
  description: string
  destructive?: boolean
  onPress: () => void
}

const ChoiceCard: React.FC<ChoiceCardProps> = ({
  icon,
  iconColor,
  title,
  description,
  destructive,
  onPress,
}) => {
  const theme = useTheme()
  return (
    <Button
      noTransform
      onPress={onPress}
      style={{
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: theme.numbers.borderRadiusSm,
        borderWidth: 1,
        borderColor: destructive
          ? theme.colors.errorTranslucent
          : theme.colors.border,
        backgroundColor: theme.colors.backgroundLighter,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.background,
          }}
        >
          <FontAwesomeIcon icon={icon} size={16} color={iconColor} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{
              fontSize: theme.fontSize('md'),
              fontFamily: theme.fonts.semiBold,
              color: destructive ? theme.colors.error : theme.colors.text,
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              lineHeight: 18,
            }}
          >
            {description}
          </Text>
        </View>
      </View>
    </Button>
  )
}

export default FirstEnableSheet
