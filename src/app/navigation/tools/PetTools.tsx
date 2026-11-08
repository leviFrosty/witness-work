import { PawPrint as PawPrintIcon } from 'lucide-react-native'
import ChoiceChips from '@/components/ui/ChoiceChips'
import Switch from '@/components/ui/Switch'
import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import usePet from '@/stores/pet'
import {
  rewardSoundSets,
  usePreferences,
  type RewardSoundSet,
} from '@/stores/preferences'
import { toast } from '@/stores/toasts'
import { PET_SPECIES_IDS } from '@/types/pet'
import { petHarness } from '@/app/dev-harness/pet'
import {
  ToolList,
  ToolRow,
  ToolSection,
  ToolSubheading,
} from '@/app/navigation/tools/ToolsUI'
import { usePetSession } from '@/features/pet/stores/petSession'

const HEARTS = ['real', '0', '1', '2.5', '4', '5'] as const
const MOMENTS = ['entrance', 'trick', 'twirl', 'wake', 'cheer'] as const

const confirmDevAction = (title: string, onConfirm: () => void) =>
  confirmDestructive({
    title,
    description: 'This cannot be undone.',
    onConfirm,
  })

const done = (label: string) => toast.info(label)
const onOff = (value: boolean) => (value ? 'On' : 'Off')

export default function PetTools() {
  const pet = usePet((state) => state.pet)
  const tombstones = usePet((state) => state.deletedPetRecords.length)
  const promptDismissed = usePreferences((state) => state.petPromptDismissed)
  const rewardAnimations = usePreferences((state) => state.rewardAnimations)
  const rewardSounds = usePreferences((state) => state.rewardSounds)
  const setPreferences = usePreferences((state) => state.set)
  const override = usePetSession((state) => state.devOverride)

  return (
    <ToolSection
      title='Pet'
      icon={PawPrintIcon}
      summary={
        pet
          ? `${pet.species} · ${pet.coat} · since ${pet.adoptedOn}`
          : 'No companion'
      }
    >
      <ToolSubheading title='Companion' />
      <ToolList>
        <ToolRow label='Prompt dismissed' value={onOff(!!promptDismissed)} />
        <ToolRow
          label='Reset opt-in prompt'
          onPress={() => {
            petHarness.resetPrompt()
            done('Pet prompt reset')
          }}
        />
        <ToolRow label='Tombstones' value={`${tombstones}`} />
        {pet && (
          <ToolRow
            label='Release companion (synced)'
            info='Same path as the in-app release: tombstones the pet and room so other devices remove them too.'
            tone='destructive'
            onPress={() =>
              confirmDevAction('Release companion', () => {
                petHarness.release()
                done(i18n.t('deleted'))
              })
            }
          />
        )}
        <ToolRow
          label='Wipe pet store (local)'
          info='Clears the pet, room and tombstones on this device only. Sync may restore them.'
          tone='destructive'
          onPress={() =>
            confirmDevAction('Wipe pet store', () => {
              usePet.getState()._WARNING_forceDeletePet()
              done(i18n.t('deleted'))
            })
          }
        />
      </ToolList>
      <ToolSubheading
        title={pet ? 'Adopt again today' : 'Adopt today'}
        info='Replaces the companion with a new one of this species, adopted today, and plays its entrance.'
      />
      <ChoiceChips
        accessibilityLabel='Adopt a species'
        options={PET_SPECIES_IDS.map((key) => ({ key, label: key }))}
        value={pet?.species ?? null}
        onChange={(species) => {
          petHarness.adopt(species)
          done(`Adopted a ${species}`)
        }}
        style={{ paddingTop: 8 }}
      />

      {pet && (
        <>
          <ToolSubheading
            title='Collection'
            info='Stored on the pet and synced, like the real thing.'
          />
          <ToolList>
            <ToolRow
              label={`Keepsakes (${pet.keepsakes.length})`}
              info='On fills the shelf with every kind, one a day back from today. Off empties it.'
              trailing={
                <Switch
                  value={pet.keepsakes.length > 0}
                  onValueChange={(on) => void petHarness.keepsakes(on)}
                  accessibilityLabel='Keepsakes'
                />
              }
            />
            <ToolRow
              label='Secrets shown (not stored)'
              trailing={
                <Switch
                  value={override?.secrets === true}
                  onValueChange={(on) =>
                    void petHarness.override({ secrets: on || undefined })
                  }
                  accessibilityLabel='Secrets shown'
                />
              }
            />
          </ToolList>

          <ToolSubheading title='Life (this device)' />
          <ChoiceChips
            accessibilityLabel='Fake hearts'
            options={HEARTS.map((key) => ({ key, label: key }))}
            value={
              override?.hearts === undefined ? 'real' : `${override.hearts}`
            }
            onChange={(key) =>
              petHarness.override({
                hearts: key === 'real' ? undefined : Number(key),
              })
            }
            style={{ paddingTop: 8 }}
          />
          <ToolList>
            <ToolRow
              label='Asleep for good'
              trailing={
                <Switch
                  value={override?.dead === true}
                  onValueChange={(on) =>
                    void petHarness.override({ dead: on || undefined })
                  }
                  accessibilityLabel='Asleep for good'
                />
              }
            />
            <ToolRow
              label='Gold hearts'
              trailing={
                <Switch
                  value={override?.gold === true}
                  onValueChange={(on) =>
                    void petHarness.override({ gold: on || undefined })
                  }
                  accessibilityLabel='Gold hearts'
                />
              }
            />
            <ToolRow
              label='Clear every fake'
              disabled={!override}
              onPress={() => {
                petHarness.clearOverride()
                done('Fakes cleared')
              }}
            />
          </ToolList>

          <ToolSubheading
            title='Rewards'
            info='Plays the reward stack as saves would. Nothing is earned.'
          />
          <ToolList>
            <ToolRow
              label='Reward animations'
              trailing={
                <Switch
                  value={rewardAnimations}
                  onValueChange={(on) =>
                    setPreferences({ rewardAnimations: on })
                  }
                  accessibilityLabel='Reward animations'
                />
              }
            />
            <ToolRow
              label='Play +1 Time added'
              onPress={() => petHarness.reward('soft')}
            />
            <ToolRow
              label='Play a planned day kept'
              onPress={() => petHarness.reward('save')}
            />
            <ToolRow
              label='Play a streak milestone'
              info='Opens the streak celebration too, so its line plays there.'
              onPress={() => petHarness.reward('milestone')}
            />
            <ToolRow
              label='Back after 3 days'
              info='The Home card plays what was earned elsewhere the next time it is on screen.'
              onPress={() => {
                petHarness.awayFor(3)
                done('Open Home to play it')
              }}
            />
            <ToolRow
              label='Forget what this device showed'
              info='The next sight of the pet starts from now, with nothing to play.'
              onPress={() => {
                petHarness.seen(null)
                done('Forgotten')
              }}
            />
          </ToolList>
          <ChoiceChips<RewardSoundSet>
            accessibilityLabel='Reward sounds'
            options={rewardSoundSets.map((key) => ({ key, label: key }))}
            value={rewardSounds}
            onChange={(key) => setPreferences({ rewardSounds: key })}
            style={{ paddingTop: 8 }}
          />

          <ToolSubheading
            title='Moments'
            info='Plays on the Home card; Home must be on screen.'
          />
          <ChoiceChips
            accessibilityLabel='Play a moment'
            options={MOMENTS.map((key) => ({ key, label: key }))}
            value={null}
            onChange={(kind) => petHarness.play(kind)}
            style={{ paddingTop: 8 }}
          />
        </>
      )}
    </ToolSection>
  )
}
