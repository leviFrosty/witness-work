import { useState } from 'react'
import {
  LayoutChangeEvent,
  NativeSyntheticEvent,
  TextLayoutEventData,
  View,
} from 'react-native'
import { Image as ExpoImage } from 'expo-image'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faHeart } from '@fortawesome/free-solid-svg-icons/faHeart'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import ActionButton from '@/components/ui/ActionButton'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

interface Props {
  goBack: () => void
  goNext: () => void
}

const IMAGE_SIZE = 102
const HALO_PADDING = 4
const IMAGE_SLOT = IMAGE_SIZE + HALO_PADDING * 2
const IMAGE_GAP = 14
const BODY_LINE_HEIGHT = 26
const LINES_BESIDE_IMAGE = Math.ceil(IMAGE_SLOT / BODY_LINE_HEIGHT)

const FounderNote = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const body = i18n.t('founderNoteBody')
  const [wrapWidth, setWrapWidth] = useState<number | null>(null)
  const [splitIndex, setSplitIndex] = useState<number | null>(null)

  const handleWrapLayout = (e: LayoutChangeEvent) => {
    if (wrapWidth === null) {
      setWrapWidth(e.nativeEvent.layout.width)
    }
  }

  const handleMeasureTextLayout = (
    e: NativeSyntheticEvent<TextLayoutEventData>
  ) => {
    const { lines } = e.nativeEvent
    if (lines.length <= LINES_BESIDE_IMAGE) {
      setSplitIndex(body.length)
      return
    }
    let index = 0
    for (let i = 0; i < LINES_BESIDE_IMAGE; i++) {
      index += lines[i].text.length
    }
    setSplitIndex(index)
  }

  const besideText = splitIndex !== null ? body.slice(0, splitIndex) : ''
  const belowText = splitIndex !== null ? body.slice(splitIndex) : ''
  const besideWidth =
    wrapWidth !== null ? wrapWidth - IMAGE_SLOT - IMAGE_GAP : 0

  return (
    <Wrapper
      style={{
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 60,
      }}
    >
      <OnboardingNav goBack={goBack} />
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: 30,
          paddingBottom: 20,
        }}
        showsVerticalScrollIndicator={false}
        enableOnAndroid={true}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginBottom: 18,
          }}
        >
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: theme.colors.supporterTranslucent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FontAwesomeIcon
              icon={faHeart}
              size={11}
              color={theme.colors.supporter}
            />
          </View>
          <Text
            style={{
              fontSize: 11,
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.supporter,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            {i18n.t('founderNoteTitle')}
          </Text>
        </View>

        <View
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: theme.numbers.borderRadiusLg,
            paddingVertical: 20,
            paddingHorizontal: 18,
            marginBottom: 24,
            borderLeftWidth: 3,
            borderLeftColor: theme.colors.supporter,
            shadowColor: theme.colors.shadow,
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: theme.numbers.shadowOpacity,
          }}
        >
          <View onLayout={handleWrapLayout}>
            {wrapWidth !== null && splitIndex === null && (
              <Text
                onTextLayout={handleMeasureTextLayout}
                style={{
                  position: 'absolute',
                  opacity: 0,
                  width: besideWidth,
                  fontSize: 16,
                  lineHeight: BODY_LINE_HEIGHT,
                }}
              >
                {body}
              </Text>
            )}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: IMAGE_GAP,
              }}
            >
              <View
                style={{
                  padding: HALO_PADDING,
                  borderRadius: IMAGE_SLOT / 2,
                  backgroundColor: theme.colors.supporterTranslucent,
                }}
              >
                <ExpoImage
                  source={require('@/assets/levi-portrait.png')}
                  style={{
                    width: IMAGE_SIZE,
                    height: IMAGE_SIZE,
                    borderRadius: IMAGE_SIZE / 2,
                  }}
                  contentFit='cover'
                  cachePolicy='memory-disk'
                  transition={150}
                />
              </View>
              <Text
                style={{
                  flex: 1,
                  fontSize: 16,
                  color: theme.colors.text,
                  lineHeight: BODY_LINE_HEIGHT,
                }}
              >
                {besideText}
              </Text>
            </View>
            {belowText.length > 0 && (
              <Text
                style={{
                  fontSize: 16,
                  color: theme.colors.text,
                  lineHeight: BODY_LINE_HEIGHT,
                }}
              >
                {belowText}
              </Text>
            )}
          </View>

          <View style={{ marginTop: 8, alignItems: 'flex-start', gap: 4 }}>
            <ExpoImage
              source={require('@/assets/signature.png')}
              style={{
                width: 180,
                height: 64,
              }}
              contentFit='contain'
              cachePolicy='memory-disk'
              tintColor={theme.colors.text}
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                  letterSpacing: 0.3,
                }}
              >
                {i18n.t('founderNoteSignOff')}
              </Text>
              <FontAwesomeIcon
                icon={faHeart}
                size={12}
                color={theme.colors.supporter}
              />
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>
      <ActionButton onPress={goNext}>{i18n.t('continue')}</ActionButton>
    </Wrapper>
  )
}

export default FounderNote
