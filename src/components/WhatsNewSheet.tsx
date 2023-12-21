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

export const WhatsNewContent = ({ lastVersion }: { lastVersion: string }) => {
  const theme = useTheme()

  const notes = useMemo(
    () =>
      releaseNotes.sort(
        (a, b) => moment(b.date).unix() - moment(a.date).unix()
      ),
    []
  )

  return (
    <View style={{ flexGrow: 1, minHeight: 10 }}>
      <FlashList
        scrollEnabled={false}
        data={notes}
        renderItem={({ item }) => (
          <View style={{ gap: 10, minHeight: 5 }} key={item.date.toString()}>
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
                  gap: 7,
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
                  <Badge size='sm'>{i18n.t('new')}</Badge>
                )}
                {semver.eq(
                  item.version,
                  Constants.expoConfig?.version || ''
                ) && (
                  <Text
                    style={{
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('sm'),
                    }}
                  >
                    {i18n.t('installed')}
                  </Text>
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
    </View>
  )
}

/**
 * Displays release notes for new versions.
 *
 * Handles setting new version for preferences after mounts. Do not set lastVersion outside of this component.
 *
 */
const WhatsNewSheet: React.FC<Props> = ({ show, setShow }) => {
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
      animation='quick'
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        <XStack ai='center' jc='space-between' px={20} pt={30} pb={20}>
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
        <Sheet.ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom }}
        >
          <View
            style={{
              paddingHorizontal: 20,
              flexGrow: 1,
              paddingBottom: insets.bottom + 10,
              gap: 20,
            }}
          >
            {/* Prevents rendering unneeded components at the home screen if not needed to save performance. */}
            {show && (
              <WhatsNewContent lastVersion={lastVersion.current || '1.0.0'} />
            )}
          </View>
        </Sheet.ScrollView>
      </Sheet.Frame>
    </Sheet>
  )
}

export default WhatsNewSheet
