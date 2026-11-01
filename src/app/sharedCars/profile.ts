import { memberTag } from '@/lib/sharedSpaces/crypto'
import {
  clip,
  MEMBER_AVATAR_MAX,
  MEMBER_NAME_MAX,
  type MemberRecordData,
} from '@/lib/sharedSpaces/records'

export type SharedCarProfile = {
  name: string

  avatar?: string

  inboxId: string
}

export type SharedCarProfileProvider = () =>
  | SharedCarProfile
  | Promise<SharedCarProfile>

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

export function withAvatar(
  data: MemberRecordData,
  avatar: string | undefined
): MemberRecordData {
  const { avatar: _own, ...rest } = data
  return avatar && avatar.length <= MEMBER_AVATAR_MAX
    ? { ...rest, avatar }
    : rest
}

export const sameMemberData = (
  record: Partial<MemberRecordData>,
  data: MemberRecordData
) =>
  record.name === data.name &&
  record.avatar === data.avatar &&
  record.tag === data.tag &&
  record.joinedAt === data.joinedAt

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
