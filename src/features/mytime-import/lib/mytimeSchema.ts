/**
 * Raw row shapes for the subset of MyTime's Core Data SQLite tables the import
 * reads. Column names are kept verbatim (`Z`-prefixed, including MyTime's own
 * `ZLATTITUDE` misspelling) so the reader is a thin `SELECT` pass-through and
 * the mapper carries the full burden of translation. Every column is typed as
 * nullable: MyTime shipped ~19 Core Data model versions, so a real backup may
 * be missing values the newest schema defines — the mapper must tolerate it.
 *
 * All `*DATE`/`*TIMESTAMP` number columns are Core Data reference timestamps
 * (see `coreDataDate.ts`), except `ZTIMESTAMP` on a statistics adjustment which
 * is a `YYYYMM` integer.
 */

/** A contact (`ZCALL`). `ZDELETEDCALL = 1` marks a soft-deleted contact. */
export interface MytimeCallRow {
  Z_PK: number
  ZDELETEDCALL: number | null
  ZNAME: string | null
  ZHOUSENUMBER: string | null
  ZSTREET: string | null
  ZAPARTMENTNUMBER: string | null
  ZCITY: string | null
  ZSTATE: string | null
  ZLATTITUDE: number | null
  ZLONGITUDE: number | null
  ZMOSTRECENTRETURNVISITDATE: number | null
}

/** A field-ministry visit (`ZRETURNVISIT`). `ZCALL` is the FK to `ZCALL.Z_PK`. */
export interface MytimeReturnVisitRow {
  Z_PK: number
  ZCALL: number | null
  ZDATE: number | null
  ZNOTES: string | null
  ZTYPE: string | null
}

/**
 * A contact attribute (`ZADDITIONALINFORMATION`) — phone/email/notes/custom.
 * `ZCALL` is the FK to `ZCALL.Z_PK`; `ZTYPE` is the FK to
 * `ZADDITIONALINFORMATIONTYPE.Z_PK` (NOT a string — the human label lives on
 * the type row).
 */
export interface MytimeAdditionalInfoRow {
  Z_PK: number
  ZCALL: number | null
  ZTYPE: number | null
  ZVALUE: string | null
  ZDATE: number | null
}

/** The label/definition for an additional-information attribute. */
export interface MytimeAdditionalInfoTypeRow {
  Z_PK: number
  ZNAME: string | null
}

/**
 * A logged block of service time (`ZTIMEENTRY`). `ZMINUTES` is the whole-entry
 * minute total; `ZTYPE` is the FK to `ZTIMETYPE.Z_PK`.
 */
export interface MytimeTimeEntryRow {
  Z_PK: number
  ZMINUTES: number | null
  ZTYPE: number | null
  ZDATE: number | null
  ZNOTES: string | null
}

/** A time category (`ZTIMETYPE`) — "Hours", "LDC", "RBC", or user-defined. */
export interface MytimeTimeTypeRow {
  Z_PK: number
  ZNAME: string | null
  ZDIRECTCREDIT: number | null
}

/**
 * A monthly statistics adjustment (`ZSTATISTICSADJUSTMENT`). For `ZTYPE =
 * "Hours"` the `ZADJUSTMENT` is a signed delta in MINUTES applied to that
 * month's displayed total; `ZTIMESTAMP` is the `YYYYMM` integer the adjustment
 * applies to. Other `ZTYPE`s (counts of studies, publications, etc.) have no
 * WitnessWork equivalent and are ignored.
 */
export interface MytimeStatisticsAdjustmentRow {
  Z_PK: number
  ZTYPE: string | null
  ZTIMESTAMP: number | null
  ZADJUSTMENT: number | null
}

/** The publisher record (`ZUSER`). A backup normally has exactly one. */
export interface MytimeUserRow {
  Z_PK: number
  ZPUBLISHERTYPE: string | null
  ZPIONEERSTARTDATE: number | null
  ZNAME: string | null
}

/**
 * The full set of raw tables `readMytimeDb` produces and `mapMytimeData`
 * consumes.
 */
export interface MytimeRawTables {
  calls: MytimeCallRow[]
  returnVisits: MytimeReturnVisitRow[]
  additionalInfo: MytimeAdditionalInfoRow[]
  additionalInfoTypes: MytimeAdditionalInfoTypeRow[]
  timeEntries: MytimeTimeEntryRow[]
  timeTypes: MytimeTimeTypeRow[]
  statisticsAdjustments: MytimeStatisticsAdjustmentRow[]
  users: MytimeUserRow[]
}
