import { View } from 'react-native'
import { Sheet, XStack } from 'tamagui'
import i18n from '../lib/locales'
import Text from './MyText'
import useTheme from '../contexts/theme'
import IconButton from './IconButton'
import { faTimes } from '@fortawesome/free-solid-svg-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useEffect, useMemo, useRef } from 'react'
import { releaseNotes } from '../constants/releaseNotes'
import moment from 'moment'
import { FlashList } from '@shopify/flash-list'
import Divider from './Divider'
import { usePreferences } from '../stores/preferences'
import Constants from 'expo-constants'
import Badge from './Badge'
import semver from 'semver'

interface Props {
  setShow: React.Dispatch<React.SetStateAction<boolean>>
  show: boolean
}

interface Props {
  /**
   * If referenced directly from preferences, will may updated automatically when the component mounts.
   *
   * Likely should use a ref to the value in preferences.
   */
  lastVersion: string
}

const WhatsNewContent = ({ lastVersion }: { lastVersion: string }) => {
  const theme = useTheme()

  const notes = useMemo(
    () =>
      releaseNotes.sort(
        (a, b) => moment(b.date).unix() - moment(a.date).unix()
      ),
    []
  )

  return (
    <FlashList
      data={notes}
      renderItem={({ item }) => (
        <View style={{ gap: 10 }} key={item.date.toString()}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('xl'),
                  color: theme.colors.text,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {item.version}
              </Text>
              {semver.lt(lastVersion, item.version) && (
                <Badge>{i18n.t('new')}</Badge>
              )}
            </View>
            <Text
              style={{
                color: theme.colors.textAlt,
              }}
            >
              {moment(item.date).fromNow()}
            </Text>
          </View>
          {item.content.map((c, index) => {
            return (
              <Text key={index}>{`- ${i18n.t(
                `updates.${item.version.replaceAll('.', '')}.${c}`
              )}`}</Text>
            )
          })}
        </View>
      )}
      ItemSeparatorComponent={() => <Divider marginVertical={25} />}
      estimatedItemSize={125}
    />
  )
}

/**
 * Displays release notes for new versions.
 *
 * Handles setting new version for preferences after mounts. Do not set lastVersion outside of this component.
 *
 */
const WhatsNew: React.FC<Props> = ({ show, setShow }) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { lastAppVersion, set } = usePreferences()
  const lastVersion = useRef(lastAppVersion)

  useEffect(() => {
    set({
      lastAppVersion: Constants.expoConfig?.version,
    })

    // Only runs on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Sheet
      open={show}
      modal
      onOpenChange={(o: boolean) => setShow(o)}
      dismissOnSnapToBottom
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        <View
          style={{
            paddingTop: 30,
            paddingHorizontal: 20,
            flexGrow: 1,
            paddingBottom: insets.bottom + 10,
            gap: 20,
          }}
        >
          <XStack ai='center' jc='space-between'>
            <Text
              style={{
                fontSize: theme.fontSize('3xl'),
                color: theme.colors.text,
                fontFamily: theme.fonts.bold,
              }}
            >
              {i18n.t('whatsNew')}
            </Text>

            <IconButton
              onPress={() => setShow(false)}
              size={20}
              icon={faTimes}
              color={theme.colors.text}
            />
          </XStack>
          <WhatsNewContent lastVersion={lastVersion.current || '1.0.0'} />
        </View>
      </Sheet.Frame>
    </Sheet>
  )
}

export default WhatsNew
