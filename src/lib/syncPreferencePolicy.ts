export const NON_SYNCABLE_PREFERENCE_KEYS = new Set<string>([
  'onboardingComplete',
  'prefillAddress',
  'iCloudSyncPendingPush',
  'iCloudClockOffsetMs',
  'iCloudClockCalibrated',
  'iCloudSyncIssue',
  'iCloudSyncNeedsResolution',
  'iCloudResetEpoch',
  'iCloudResetAdoptedNotice',
  'iCloudSyncDevices',
  'iCloudSyncPausedForLapse',
  'iCloudFreshSetup',
  'hasReconciledSyncDefinitions',
  'iCloudSyncEnabled',
  'iCloudSyncSetByUser',
  'iCloudSyncIncludeImages',
  'dataProtectionMode',
  'dataProtectionModeSetByUser',
  'dataProtectionRetentionPromptedAt',
  'audioEnabled',
  'iCloudImageSync',
  'lastiCloudSyncAt',
  'lastiCloudPushedAt',
  'lastiCloudPulledAt',
  'lastiCloudUploadedAt',
  'iCloudUploadPendingSince',
  'iCloudUploadIssue',
  'lastiCloudRemoteWrittenAt',
  'lastiCloudRemoteDeviceId',
  'lastiCloudRemoteDeviceName',
  'iCloudDeviceId',
  'iCloudDeviceBinding',
  'iCloudIdentityToken',
  'iCloudAccountChangedAt',
  'preferenceUpdatedAt',
  'hasMigratedToSyncSchema',
  'hasMigratedCustomFieldsToIds',
  'hasMigratedTagsToCategories',
  'hasMigratedProfileFromPreferences',
  'hasCollapsedLdcIntoCategory',
  // Legacy field — removed from the schema but may still exist on disk for
  // installs that pre-date the id-keyed migration. Listed here so the boot
  // cleanup that wipes it doesn't propagate the deletion through sync.
  'customContactFields',
  'devSupporterOverride',
  'devSupporterNudgeForceShow',
  'devShowAppIconAlerts',
  'developerTools',
  'hasAttemptedToMigrateToMmkv',
  'monthlyRoutineHasShownInvalidMonthAlert',
  'lastAppVersion',
  'unreadReleaseNotes',
  'calledGoecodeApiTimes',
  'lastTimeRequestedAReview',
  'lastBackupDate',
  'backupReminderSnoozedAt',
  'analyticsEnabled',
  'onboardingStepId',
  'celebratedTiers',
  'celebratedMilestones',
  'homeChecklistAllDoneCelebrated',
  'devRolloverDateOverride',
  'updateReveal',
  'seenFoundingSupporterReveal',
  'contactsView',
])

export const NON_SYNCABLE_PROFILE_KEYS = new Set(['profileUpdatedAt'])

/** Both onboarding fresh-start paths preserve an explicit device-local choice. */
export const FRESH_SETUP_PREFERENCES = {
  iCloudFreshSetup: true,
  iCloudSyncEnabled: false,
  iCloudSyncSetByUser: true,
  iCloudSyncNeedsResolution: false,
}

/** Maps are merged per entry. Missing entries with a stamp represent deletions. */
export const SYNC_MAP_KEYS = new Set([
  'monthlyGoalOverrides',
  'reportCommentOverrides',
  'publisherHours',
])
export const SYNC_SET_KEYS = new Set(['seenTipIds', 'submittedReportMonths'])
export const entryTimestampKey = (key: string, entry: string) =>
  `${key}:${entry}`

export function roleHistoryEntries(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  const history = value as {
    initial?: unknown
    changes?: Record<string, unknown>
  }
  return { initial: history.initial, ...(history.changes ?? {}) }
}

export function syncableValues(
  values: Record<string, unknown>,
  excluded: ReadonlySet<string> = NON_SYNCABLE_PREFERENCE_KEYS
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) =>
        !excluded.has(key) &&
        !['__proto__', 'constructor', 'prototype', 'set'].includes(key) &&
        typeof value !== 'function'
    )
  )
}
