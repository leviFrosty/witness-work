import { ReactNode, Ref } from 'react'
import { View } from 'react-native'
import {
  ChevronDown as ChevronDownIcon,
  Maximize2 as Maximize2Icon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { useCardStyle } from '@/components/ui/Card'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PointerTooltip from '@/components/ui/PointerTooltip'
import { lightModeColors } from '@/constants/theme'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

const trailing = (end: number) => ({
  position: 'absolute' as const,
  top: 0,
  bottom: 0,
  end,
  width: 44,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
})

const DayFormCard = (props: {
  title: string

  icon: AppIcon
  openIcon: AppIcon
  testID: string

  subtitle?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onExpand?: () => void
  expandTestID?: string
  children: ReactNode
  ref?: Ref<View>
}) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()

  const badgeGlyph =
    theme.colors.background === lightModeColors.background
      ? '#0F7535'
      : theme.colors.accent
  return (
    <View ref={props.ref} style={cardStyle}>
      <View>
        <Button
          noTransform
          onPress={() => props.onOpenChange(!props.open)}
          accessibilityRole='button'
          accessibilityState={{ expanded: props.open }}
          accessibilityLabel={props.title}
          accessibilityHint={props.subtitle}
          testID={props.testID}
          style={{
            paddingVertical: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingStart: 14,

            paddingEnd: props.onExpand ? 116 : 48,
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: theme.colors.accentTranslucent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LucideIcon
              icon={props.open ? props.openIcon : props.icon}
              size={18}
              color={badgeGlyph}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('md'),
              }}
            >
              {props.title}
            </Text>
            {!props.open && props.subtitle && (
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {props.subtitle}
              </Text>
            )}
          </View>
        </Button>
        {!props.open && (
          <View pointerEvents='none' style={trailing(0)}>
            <LucideIcon
              icon={ChevronForwardIcon}
              size={20}
              strokeWidth={2.25}
              color={theme.colors.textAlt}
            />
          </View>
        )}
        {props.onExpand && (
          <View style={trailing(68)}>
            <PointerTooltip label={i18n.t('openFullScreen')}>
              <Button
                noTransform
                onPress={props.onExpand}
                accessibilityRole='button'
                accessibilityLabel={i18n.t('openFullScreen')}
                testID={props.expandTestID}
                style={{
                  width: 44,
                  height: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <LucideIcon
                  icon={Maximize2Icon}
                  size={18}
                  strokeWidth={2.25}
                  color={theme.colors.textAlt}
                />
              </Button>
            </PointerTooltip>
          </View>
        )}
        {props.open && (
          <View style={trailing(0)}>
            <Button
              noTransform
              onPress={() => props.onOpenChange(false)}
              accessibilityRole='button'
              accessibilityLabel={i18n.t('timeForm_collapse')}
              style={{
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LucideIcon
                icon={ChevronDownIcon}
                size={20}
                strokeWidth={2.25}
                color={theme.colors.textAlt}
              />
            </Button>
          </View>
        )}
      </View>
      {props.open && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          {props.children}
        </View>
      )}
    </View>
  )
}

export default DayFormCard
