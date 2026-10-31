import { memberTag } from '@/lib/sharedSpaces/crypto'
import {
  clip,
  MEMBER_AVATAR_MAX,
  MEMBER_NAME_MAX,
  type MemberRecordData,
} from '@/lib/sharedSpaces/records'

/**
 * Who the User is on their Shared Cars: what their `member` record says on each
 * car (docs/shared-cars-protocol.md, "Records"). The engine asks its provider
 * on every sync and rewrites the record on each car when it differs.
 *
 * The app's provider is Buddies' (`carProfile`): the Buddy Card's name, the
 * photo only while `sharing.photo` is on, and the User's own inbox id.
 */
export type SharedCarProfile = {
  /** Shown to everyone on the car; cut to 40 characters. */
  name: string
  /**
   * An emoji, or a 40 px JPEG of at most 4,000 characters. Left out when absent
   * or longer.
   */
  avatar?: string
  /**
   * The User's own Buddies inbox id. The engine hashes it for each car into
   * their `tag` (`memberTag`), so a buddy on the car can recognise them.
   */
  inboxId: string
}

export type SharedCarProfileProvider = () =>
  | SharedCarProfile
  | Promise<SharedCarProfile>

/** The `member` record the User's profile makes on one car. */
export function memberRecordData(
  profile: SharedCarProfile,
  spaceId: string,
  joinedAt: number
): MemberRecordData {
  const avatar =
    profile.avatar && profile.avatar.length <= MEMBER_AVATAR_MAX
      ? profile.avatar
      : undefined
  return {
    name: clip(profile.name.trim(), MEMBER_NAME_MAX),
    ...(avatar && { avatar }),
    tag: memberTag(spaceId, profile.inboxId),
    joinedAt,
  }
}

/** `data` with `avatar` in place of its own: none when it's absent or longer. */
export function withAvatar(
  data: MemberRecordData,
  avatar: string | undefined
): MemberRecordData {
  const { avatar: _own, ...rest } = data
  return avatar && avatar.length <= MEMBER_AVATAR_MAX
    ? { ...rest, avatar }
    : rest
}

/** Whether a member record already says what `data` does. */
export const sameMemberData = (
  record: Partial<MemberRecordData>,
  data: MemberRecordData
) =>
  record.name === data.name &&
  record.avatar === data.avatar &&
  record.tag === data.tag &&
  record.joinedAt === data.joinedAt

/**
 * What this device puts in the User's member record on a car, given what it
 * says now (`current`) and what this device last put (`written`). The User's
 * other devices may word their name or photo their own way (a Buddy Card that
 * hasn't synced yet, their own JPEG of a photo), so a name or avatar goes out
 * again only once it changed here since this device last put it; otherwise the
 * record keeps the one there, and two devices never take turns rewriting it.
 * The tag and the join time are the same on every device, so they're always put
 * right.
 */
export function wantedMemberData(
  expected: MemberRecordData,
  current: Partial<MemberRecordData> | undefined,
  written: { name?: string; avatar?: string | null }
): MemberRecordData {
  if (!current) return expected
  let wanted = expected
  if (written.name === expected.name && typeof current.name === 'string')
    wanted = { ...wanted, name: current.name }
  if (written.avatar === (expected.avatar ?? null))
    wanted = withAvatar(wanted, current.avatar)
  return wanted
}
