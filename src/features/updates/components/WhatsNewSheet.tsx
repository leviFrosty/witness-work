import { Gift as GiftIcon, X as XIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { View } from 'react-native'
import { Sheet, XStack } from 'tamagui'
import i18n, { TranslationKey } from '@/lib/locales'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import IconButton from '@/components/ui/IconButton'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMemo } from 'react'
import { releaseNotes } from '@/features/updates/constants/releaseNotes'
import moment from 'moment'
import { formatRelative } from '@/lib/dates'
import { FlashList } from '@shopify/flash-list'
import Divider from '@/components/ui/Divider'
import Button from '@/components/ui/Button'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '@/types/rootStack'
import Constants from 'expo-constants'
import Badge from '@/components/ui/Badge'
import semver from 'semver'

interface Props {
  setShow: React.Dispatch<React.SetStateAction<boolean>>
  show: boolean
  /**
   * Version the user last saw notes for, captured before `lastAppVersion` is
   * stamped. Only releases newer than this are listed.
   */
  sinceVersion: string
}

export const WhatsNewContent = ({
  lastVersion,
  onlyNew,
}: {
  /** Releases newer than this get the "New" badge. */
  lastVersion: string
  /** List only the releases newer than `lastVersion`. */
  onlyNew?: boolean
}) => {
  const theme = useTheme()

  const notes = useMemo(
    () =>
      [...releaseNotes]
        .filter((note) => !onlyNew || semver.gt(note.version, lastVersion))
        .sort((a, b) => moment(b.date).unix() - moment(a.date).unix()),
    [lastVersion, onlyNew]
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
                  <Badge size='sm'>
                    <Text style={{ color: theme.colors.textInverse }}>
                      {i18n.t('new')}
                    </Text>
                  </Badge>
                )}
                {item.milestone && (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 999,
                      backgroundColor: theme.colors.accent,
                    }}
                  >
                    <LucideIcon
                      icon={GiftIcon}
                      size={10}
                      color={theme.colors.textInverse}
                    />
                    <Text
                      style={{
                        color: theme.colors.textInverse,
                        fontSize: theme.fontSize('xs'),
                        fontFamily: theme.fonts.semiBold,
                        letterSpacing: 0.4,
                      }}
                    >
                      {i18n.t('milestoneReveal_title')}
                    </Text>
                  </View>
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
                {formatRelative(item.date)}
              </Text>
            </View>
            {item.content.map((c, index) => {
              return (
                <Text key={index}>{`- ${i18n.t(
                  `updates.${item.version.replaceAll(
                    '.',
                    ''
                  )}.${c}` as TranslationKey
                )}`}</Text>
              )
            })}
          </View>
        )}
        ItemSeparatorComponent={() => <Divider marginVertical={25} />}
      />
    </View>
  )
}

/**
 * Displays release notes for the versions the user hasn't seen yet, with a link
 * to the full history. Only used for releases announced as `'sheet'`; the
 * launch gate in `HomeTabStack` owns stamping `lastAppVersion`.
 */
const WhatsNewSheet: React.FC<Props> = ({ show, setShow, sinceVersion }) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()

  const handleSeeAll = () => {
    setShow(false)
    navigation.navigate('Whats New')
  }

  return (
    <Sheet
      open={show}
      modal
      onOpenChange={(o: boolean) => setShow(o)}
      dismissOnSnapToBottom
      transition='quick'
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
            noTransform
            onPress={() => setShow(false)}
            size={20}
            icon={XIcon}
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
            {/* Prevents rendering unneeded components at the home screen to save performance. */}
            {show && <WhatsNewContent lastVersion={sinceVersion} onlyNew />}
            <Button onPress={handleSeeAll} style={{ alignSelf: 'center' }}>
              <Text
                style={{
                  color: theme.colors.accent,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('whatsNew_seeAll')}
              </Text>
            </Button>
          </View>
        </Sheet.ScrollView>
      </Sheet.Frame>
    </Sheet>
  )
}

export default WhatsNewSheet
