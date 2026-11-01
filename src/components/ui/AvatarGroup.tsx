import { Children, createContext, ReactNode, useContext } from 'react'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import i18n, { TranslationKey } from '@/lib/locales'

const RING_WIDTH = 2

const AvatarGroupSizeContext = createContext<number | undefined>(undefined)

export const useAvatarGroupSize = () => useContext(AvatarGroupSizeContext)

interface Props {
  children: ReactNode

  size?: number

  ringColor?: string
}

const AvatarGroup = ({ children, size = 32, ringColor }: Props) => {
  const theme = useTheme()
  const ring = ringColor ?? theme.colors.card
  const outer = size + RING_WIDTH * 2

  return (
    <AvatarGroupSizeContext.Provider value={size}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {Children.toArray(children).map((child, index) => (
          <View
            key={index}
            style={{
              padding: RING_WIDTH,
              borderRadius: outer / 2,
              backgroundColor: ring,
              marginLeft: index === 0 ? 0 : -Math.round(size * 0.25),
            }}
          >
            {child}
          </View>
        ))}
      </View>
    </AvatarGroupSizeContext.Provider>
  )
}

export const AvatarGroupCount = ({
  count,
  size: sizeProp,
}: {
  count: number
  size?: number
}) => {
  const theme = useTheme()
  const groupSize = useAvatarGroupSize()
  const size = sizeProp ?? groupSize ?? 32

  return (
    <View
      accessible
      accessibilityLabel={i18n.t('avatarGroup_moreCount' as TranslationKey, {
        count,
      })}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.border,
      }}
    >
      <Text
        style={{
          fontSize: size * 0.38,
          color: theme.colors.text,
          fontFamily: theme.fonts.semiBold,
        }}
        numberOfLines={1}
      >
        +{count}
      </Text>
    </View>
  )
}

export default AvatarGroup
