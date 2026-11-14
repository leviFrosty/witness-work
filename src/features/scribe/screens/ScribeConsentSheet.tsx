import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native'
import {
  ShieldCheck as ShieldCheckIcon,
  SquareArrowOutUpRight as ExternalIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { ChecklistIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import links from '@/constants/links'
import useTheme from '@/contexts/theme'
import { openURL } from '@/lib/links'
import i18n from '@/lib/locales'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import { scribeKey } from '@/features/scribe/components/scribeCopy'
import { settleScribeConsent } from '@/features/scribe/components/scribeConsentGate'
import ScribeSheetFrame, {
  type ScribeSheetDismissal,
} from '@/features/scribe/components/ScribeSheetFrame'
import {
  acceptScribeTerms,
  scribeTermsPending,
} from '@/features/scribe/stores/consent'
import {
  trackTermsResolved,
  type ScribeTermsDismissedVia,
} from '@/features/scribe/analytics'

const ScribeConsentSheet = () => {
  const navigation = useNavigation<RootStackNavigation>()
  const { params } = useRoute<RouteProp<RootStackParamList, 'ScribeConsent'>>()
  const { surface, next } = params
  const [alreadyAgreed] = useState(() => !scribeTermsPending())
  const resolved = useRef(false)

  const goOn = () => {
    if (!next) navigation.goBack()
    else if (next.route === 'ScribeVoice')
      navigation.replace('ScribeVoice', next.params)
    else navigation.replace('ScribeConversation', next.params)
  }

  const agree = () => {
    if (resolved.current) return
    resolved.current = true
    acceptScribeTerms()
    trackTermsResolved(surface, 'accepted')
    settleScribeConsent(true)
    goOn()
  }

  const continueIfAgreed = useEffectEvent(() => {
    if (!alreadyAgreed) return
    resolved.current = true
    settleScribeConsent(true)
    goOn()
  })
  useEffect(() => continueIfAgreed(), [])

  const dismissed = (via: ScribeTermsDismissedVia) => {
    if (resolved.current) return
    resolved.current = true
    trackTermsResolved(surface, 'dismissed', via)
    settleScribeConsent(false)
  }

  const dismissedBySystem = useEffectEvent(() => dismissed('system'))
  useEffect(
    () => navigation.addListener('beforeRemove', () => dismissedBySystem()),
    [navigation]
  )

  const close = (via: ScribeSheetDismissal) => {
    dismissed(via === 'escape' ? 'system' : via)
    navigation.goBack()
  }

  if (alreadyAgreed) return null

  return (
    <ScribeSheetFrame onDismissRequest={close}>
      <TermsStep onAccept={agree} />
    </ScribeSheetFrame>
  )
}

function TermsStep({ onAccept }: { onAccept: () => void }) {
  const theme = useTheme()
  return (
    <>
      {}
      <ScrollView
        style={{ flexGrow: 0, flexShrink: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 22,
          paddingTop: 6,
          gap: 20,
        }}
      >
        <View style={{ gap: 6 }}>
          <Text
            accessibilityRole='header'
            style={{
              fontSize: theme.fontSize('xl'),
              fontFamily: theme.fonts.bold,
            }}
          >
            {i18n.t('scribe_termsTitle')}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('md'),
              color: theme.colors.text,
              lineHeight: 22,
            }}
          >
            {i18n.t(scribeKey('scribe_termsIntro'))}
          </Text>
        </View>
        <Point
          icon={ShieldCheckIcon}
          title={i18n.t('scribe_termsPrivateTitle')}
          body={i18n.t(scribeKey('scribe_termsPrivateBody'))}
        />
        <Point
          icon={ChecklistIcon}
          title={i18n.t('scribe_termsMistakesTitle')}
          body={i18n.t('scribe_termsMistakesBody')}
        />
        <View style={{ gap: 4 }}>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              lineHeight: 20,
            }}
          >
            {i18n.t('scribe_termsBody')}
          </Text>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 24 }}
          >
            <PolicyLink label={i18n.t('termsOfUse')} url={links.termsOfUse} />
            <PolicyLink
              label={i18n.t('privacyPolicy')}
              url={links.privacyPolicy}
            />
          </View>
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 8 }}>
        <PrimaryButton label={i18n.t('scribe_termsAgree')} onPress={onAccept} />
      </View>
    </>
  )
}

function Point({
  icon,
  title,
  body,
}: {
  icon: AppIcon
  title: string
  body: string
}) {
  const theme = useTheme()
  return (
    <View accessible style={{ flexDirection: 'row', gap: 14 }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: theme.colors.accentTranslucent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LucideIcon icon={icon} size={20} color={theme.colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.text,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
            lineHeight: 20,
          }}
        >
          {body}
        </Text>
      </View>
    </View>
  )
}

function PolicyLink({ label, url }: { label: string; url: string }) {
  const theme = useTheme()
  return (
    <Button
      noTransform
      accessibilityRole='link'
      onPress={() => openURL(url)}
      style={{
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'transparent',
      }}
    >
      <Text
        style={{
          fontSize: theme.fontSize('md'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.accent,
        }}
      >
        {label}
      </Text>
      <LucideIcon icon={ExternalIcon} size={14} color={theme.colors.accent} />
    </Button>
  )
}

function PrimaryButton({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) {
  const theme = useTheme()
  return (
    <Button
      noTransform
      onPress={onPress}
      style={{
        minHeight: 52,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: theme.colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: theme.fontSize('lg'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textInverse,
        }}
      >
        {label}
      </Text>
    </Button>
  )
}

export default ScribeConsentSheet
