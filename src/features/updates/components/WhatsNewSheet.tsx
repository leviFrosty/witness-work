import { Gift as GiftIcon, X as XIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { View } from 'react-native'
import { XStack } from 'tamagui'
import Sheet from '@/components/ui/Sheet'
import i18n, { TranslationKey } from '@/lib/locales'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import IconButton from '@/components/ui/IconButton'
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
import { tracking } from '@/lib/tracking'
import UpdateTourCard from '@/features/updates/components/UpdateTourCard'
import { UPDATE_REVEAL_VERSION } from '@/features/updates/constants/updateReveal'

interface Props {
  show: boolean

  onClose: () => void

  sinceVersion: string
}

export const WhatsNewContent = ({
  lastVersion,
  onlyNew,
  showTourCard,
}: {
  lastVersion: string

  onlyNew?: boolean

  showTourCard?: boolean
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
            {showTourCard && semver.eq(item.version, UPDATE_REVEAL_VERSION) && (
              <UpdateTourCard />
            )}
            {}
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                rowGap: 4,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  flexShrink: 1,
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
                {item.name && (
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
                        letterSpacing: tracking(0.4),
                      }}
                    >
                      {i18n.t(item.name)}
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

const WhatsNewSheet: React.FC<Props> = ({ show, onClose, sinceVersion }) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()

  const handleSeeAll = () => {
    onClose()
    navigation.navigate('Whats New')
  }

  return (
    <Sheet
      open={show}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
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
          frame
          noTransform
          onPress={onClose}
          size={20}
          icon={XIcon}
          color={theme.colors.text}
        />
      </XStack>
      <Sheet.ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={{ paddingHorizontal: 20, gap: 20 }}>
          {}
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
    </Sheet>
  )
}

export default WhatsNewSheet
