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

export interface MytimeReturnVisitRow {
  Z_PK: number
  ZCALL: number | null
  ZDATE: number | null
  ZNOTES: string | null
  ZTYPE: string | null
}

export interface MytimeAdditionalInfoRow {
  Z_PK: number
  ZCALL: number | null
  ZTYPE: number | null
  ZVALUE: string | null
  ZDATE: number | null
}

export interface MytimeAdditionalInfoTypeRow {
  Z_PK: number
  ZNAME: string | null
}

export interface MytimeTimeEntryRow {
  Z_PK: number
  ZMINUTES: number | null
  ZTYPE: number | null
  ZDATE: number | null
  ZNOTES: string | null
}

export interface MytimeTimeTypeRow {
  Z_PK: number
  ZNAME: string | null
  ZDIRECTCREDIT: number | null
}

export interface MytimeStatisticsAdjustmentRow {
  Z_PK: number
  ZTYPE: string | null
  ZTIMESTAMP: number | null
  ZADJUSTMENT: number | null
}

export interface MytimeUserRow {
  Z_PK: number
  ZPUBLISHERTYPE: string | null
  ZPIONEERSTARTDATE: number | null
  ZNAME: string | null
}

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
