import { useState } from 'react'
import { ActivityIndicator, ScrollView, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  HandHelping as HandHelpingIcon,
  Link as LinkIcon,
  UserPlus as UserPlusIcon,
} from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Section from '@/components/ui/inputs/Section'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import Header from '@/components/ui/layout/Header'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'
import PersonPickRow from '@/features/territories/components/sharing/PersonPickRow'
import ShareScopePicker, {
  type ShareScopeMode,
} from '@/features/territories/components/sharing/ShareScopePicker'
import TerritoryQrCard from '@/features/territories/components/TerritoryQrCard'
import TerritorySectionTitle from '@/features/territories/components/TerritorySectionTitle'
import useDoorRecordPrivacy from '@/features/territories/hooks/useDoorRecordPrivacy'
import useTerritorySharing from '@/features/territories/hooks/useTerritorySharing'
import { workingStreets } from '@/features/territories/lib/doors'
import { shareSelection } from '@/features/territories/lib/shareScope'
import { joinNames } from '@/features/territories/lib/shareText'
import {
  findLiveLink,
  personShareScope,
  shareAdds,
  type ShareScope,
  heldStreetIds,
  territoryAccess,
} from '@/features/territories/lib/sharing'
import {
  territoryListTitle,
  territoryTitle,
} from '@/features/territories/lib/territoryTitle'
import { useTerritory } from '@/features/territories/stores/territories'
import type { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<RootStackParamList, 'TerritoryShare'>

const nextFrame = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => setTimeout(resolve, 0))
  )

export default function TerritoryShareScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { territoryId, streetId } = route.params
  const territory = useTerritory(territoryId)
  const privacy = useDoorRecordPrivacy()
  const sharing = useTerritorySharing()
  const [mode, setMode] = useState<ShareScopeMode>(
    streetId ? 'streets' : 'whole'
  )
  const [picked, setPicked] = useState<string[]>(streetId ? [streetId] : [])
  const [buddyIds, setBuddyIds] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [starting, setStarting] = useState(false)

  if (!territory) return null

  const access = territoryAccess(territory)
  const assigned = access === 'assigned'
  const owner = access === 'owner'
  const held = heldStreetIds(territory)
  const streets = workingStreets(territory).filter(
    (street) => owner || held.includes(street.id)
  )
  const { chosen, streetIds, nothingPicked } = shareSelection({
    mode,
    picked,
    available: streets.map((street) => street.id),
    owner,
  })
  const single =
    chosen.length === 1
      ? streets.find((street) => street.id === chosen[0])
      : undefined
  const now = Date.now()

  const scopeFor = (inboxId: string) =>
    personShareScope(
      territory,
      territory.people?.find((person) => person.inboxId === inboxId)?.id,
      now
    )
  const hasText = (scope: ShareScope | undefined) => {
    if (!scope) return undefined
    if (!scope.streetIds) return i18n.t('territories.share.hasWhole')
    const [only] = scope.streetIds
    return scope.streetIds.length === 1 && only
      ? i18n.t('territories.share.hasStreet', {
          street:
            territory.streets.find((street) => street.id === only)?.name ?? '',
        })
      : i18n.t('territories.share.hasStreets', {
          count: scope.streetIds.length,
        })
  }
  const covered = (inboxId: string) => {
    const scope = scopeFor(inboxId)
    return !!scope && !shareAdds(territory, scope, streetIds)
  }

  const toggleStreet = (id: string) =>
    setPicked(
      picked.includes(id) ? picked.filter((had) => had !== id) : [...picked, id]
    )
  const toggleBuddy = (inboxId: string) =>
    setBuddyIds((ids) =>
      ids.includes(inboxId)
        ? ids.filter((id) => id !== inboxId)
        : [...ids, inboxId]
    )

  const pickedBuddies = sharing.buddies.filter(
    (buddy) => buddyIds.includes(buddy.inboxId) && !covered(buddy.inboxId)
  )
  const shareWithBuddies = async () => {
    setSending(true)
    const shared = await sharing.actions.share(
      territoryId,
      pickedBuddies.map((buddy) => buddy.inboxId),
      streetIds
    )
    setSending(false)
    if (!shared) return
    toast.success(
      i18n.t('territories.share.shared_toast', {
        names: joinNames(pickedBuddies.map((buddy) => buddy.name)),
      })
    )
    navigation.goBack()
  }

  const openLink = async () => {
    const existing = findLiveLink(territory, streetIds, Date.now())
    if (existing) {
      navigation.replace('TerritoryShareLink', {
        territoryId,
        shareId: existing.id,
      })
      return
    }
    setStarting(true)
    await nextFrame()
    const created = await sharing.actions.createLink(territoryId, streetIds)
    setStarting(false)
    if (!created || !navigation.isFocused()) return
    navigation.replace('TerritoryShareLink', {
      territoryId,
      shareId: created.linkId,
    })
  }

  const opens = (
    <LucideIcon
      icon={ChevronForwardIcon}
      size={14}
      color={theme.colors.textAlt}
    />
  )
  const handOffRow =
    owner && !streetId && sharing.buddiesAvailable && streets.length > 0
  const cardLink = streetId ? undefined : territory.link

  const title =
    single && streetId
      ? i18n.t('territories.share.titleStreet', { street: single.name })
      : assigned
        ? i18n.t('territories.share.titleStreet', {
            street: territoryListTitle(territory),
          })
        : i18n.t('territories.share.title', {
            territory: territoryTitle(territory),
          })

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header noInsets buttonType='back' title={title} />
      <ScrollView>
        <ContentColumn
          style={{
            padding: inputLayout.horizontalPadding,
            paddingBottom: insets.bottom + 30,
            gap: 20,
          }}
        >
          <ShareScopePicker
            territory={territory}
            mode={mode}
            chosen={chosen}
            canPickWhole={owner}
            privacy={privacy}
            onPickMode={setMode}
            onToggleStreet={toggleStreet}
          />

          {nothingPicked && streets.length > 0 && (
            <Text
              testID='territory-share-pick-street'
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
                paddingHorizontal: 5,
                marginTop: -8,
              }}
            >
              {i18n.t('territories.share.pickAStreet')}
            </Text>
          )}

          {!owner && territory.received && (
            <Text
              testID='territory-share-owner-sees'
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
                paddingHorizontal: 5,
                marginTop: -8,
              }}
            >
              {i18n.t('territories.share.ownerSees', {
                name: territory.received.from.name,
              })}
            </Text>
          )}

          <Section>
            <InputRowButton
              testID='territory-share-link'
              leftIcon={LinkIcon}
              label={i18n.t('territories.share.guestLink')}
              sublabel={i18n.t(
                starting
                  ? 'territories.share.startBusy'
                  : chosen.length === 0 && !nothingPicked
                    ? 'territories.share.guestLinkNeedsStreets'
                    : 'territories.share.guestLink_description'
              )}
              disabled={chosen.length === 0}
              onPress={() => {
                if (!starting) void openLink()
              }}
              lastInSection
            >
              {starting ? (
                <ActivityIndicator
                  testID='territory-share-link-busy'
                  color={theme.colors.textAlt}
                />
              ) : (
                opens
              )}
            </InputRowButton>
          </Section>

          {sharing.buddiesAvailable && (
            <View style={{ gap: 8 }}>
              <TerritorySectionTitle
                info={i18n.t('territories.share.withBuddies_info')}
              >
                {i18n.t('territories.share.withBuddies')}
              </TerritorySectionTitle>
              <Section>
                {sharing.buddies.length === 0 ? (
                  <InputRowButton
                    leftIcon={UserPlusIcon}
                    label={i18n.t('territories.share.noBuddies')}
                    sublabel={i18n.t('territories.share.noBuddies_description')}
                    onPress={
                      sharing.canOpenBuddies
                        ? () => navigation.navigate('Buddies')
                        : undefined
                    }
                    lastInSection
                  >
                    {sharing.canOpenBuddies && opens}
                  </InputRowButton>
                ) : (
                  sharing.buddies.map((buddy, index) => (
                    <PersonPickRow
                      key={buddy.inboxId}
                      buddy={buddy}
                      picked={buddyIds.includes(buddy.inboxId)}
                      covered={covered(buddy.inboxId)}
                      sublabel={hasText(scopeFor(buddy.inboxId))}
                      onPress={() => toggleBuddy(buddy.inboxId)}
                      last={index === sharing.buddies.length - 1}
                    />
                  ))
                )}
              </Section>
              {sharing.buddies.length > 0 && (
                <ActionButton
                  testID='territory-share-buddies'
                  disabled={
                    sending || nothingPicked || pickedBuddies.length === 0
                  }
                  loading={sending}
                  submitShortcut={false}
                  onPress={() => void shareWithBuddies()}
                >
                  {pickedBuddies.length === 0
                    ? i18n.t('territories.share.pickBuddies')
                    : i18n.t('territories.share.shareWith', {
                        count: pickedBuddies.length,
                        names: pickedBuddies[0]?.name ?? '',
                      })}
                </ActionButton>
              )}
              {handOffRow && sharing.buddies.length > 0 && (
                <Section style={{ marginTop: 8 }}>
                  <InputRowButton
                    testID='territory-share-handoff'
                    leftIcon={HandHelpingIcon}
                    label={i18n.t('territories.share.handOffAStreet')}
                    sublabel={i18n.t('territories.share.handOff_description')}
                    onPress={() =>
                      navigation.replace('TerritoryHandoff', {
                        territoryId,
                        streetId:
                          mode === 'streets' && single ? single.id : undefined,
                      })
                    }
                    lastInSection
                  >
                    {opens}
                  </InputRowButton>
                </Section>
              )}
            </View>
          )}

          {cardLink && (
            <View style={{ gap: 8 }}>
              <TerritorySectionTitle>
                {i18n.t('territories.share.cardMap')}
              </TerritorySectionTitle>
              <TerritoryQrCard
                value={cardLink}
                title={i18n.t('territories.share.cardMapShareTitle', {
                  territory: territoryTitle(territory),
                })}
              />
            </View>
          )}
        </ContentColumn>
      </ScrollView>
    </View>
  )
}
