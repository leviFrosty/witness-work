import initSqlJs from 'sql.js'

/** Seconds between Unix's 1970 epoch and Core Data's 2001 reference date. */
const CORE_DATA_EPOCH = 978_307_200
const coreData = (iso: string) =>
  Math.floor(Date.parse(iso) / 1000) - CORE_DATA_EPOCH

/**
 * A small MyTime backup (a Core Data SQLite store): two contacts and a deleted
 * one, three visits, two time entries and a publisher, with made-up names. The
 * names are what the web import specs look for after the import.
 */
export async function buildMytimeBackup(): Promise<Uint8Array> {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run(`
    CREATE TABLE ZCALL (Z_PK INTEGER PRIMARY KEY, ZDELETEDCALL INTEGER, ZNAME TEXT,
      ZHOUSENUMBER TEXT, ZSTREET TEXT, ZAPARTMENTNUMBER TEXT, ZCITY TEXT, ZSTATE TEXT,
      ZLATTITUDE REAL, ZLONGITUDE REAL, ZMOSTRECENTRETURNVISITDATE REAL);
    CREATE TABLE ZRETURNVISIT (Z_PK INTEGER PRIMARY KEY, ZCALL INTEGER, ZDATE REAL,
      ZNOTES TEXT, ZTYPE TEXT);
    CREATE TABLE ZADDITIONALINFORMATION (Z_PK INTEGER PRIMARY KEY, ZCALL INTEGER,
      ZTYPE INTEGER, ZVALUE TEXT, ZDATE REAL);
    CREATE TABLE ZADDITIONALINFORMATIONTYPE (Z_PK INTEGER PRIMARY KEY, ZNAME TEXT);
    CREATE TABLE ZTIMEENTRY (Z_PK INTEGER PRIMARY KEY, ZMINUTES INTEGER, ZTYPE INTEGER,
      ZDATE REAL, ZNOTES TEXT);
    CREATE TABLE ZTIMETYPE (Z_PK INTEGER PRIMARY KEY, ZNAME TEXT, ZDIRECTCREDIT INTEGER);
    CREATE TABLE ZSTATISTICSADJUSTMENT (Z_PK INTEGER PRIMARY KEY, ZTYPE TEXT,
      ZTIMESTAMP INTEGER, ZADJUSTMENT INTEGER);
    CREATE TABLE ZUSER (Z_PK INTEGER PRIMARY KEY, ZPUBLISHERTYPE TEXT,
      ZPIONEERSTARTDATE REAL, ZNAME TEXT);
  `)
  db.run(
    `INSERT INTO ZCALL (Z_PK, ZDELETEDCALL, ZNAME, ZHOUSENUMBER, ZSTREET, ZCITY, ZSTATE)
     VALUES (1, 0, 'Maria Santos', '12', 'Oak Street', 'Springfield', 'IL'),
            (2, 0, 'Daniel Okafor', '40', 'Maple Avenue', 'Springfield', 'IL'),
            (3, 1, 'Removed Person', '1', 'Elm Road', 'Springfield', 'IL')`
  )
  db.run(
    `INSERT INTO ZRETURNVISIT (Z_PK, ZCALL, ZDATE, ZNOTES, ZTYPE) VALUES
      (1, 1, ?, 'Talked about the garden.', 'Return Visit'),
      (2, 1, ?, 'Left a magazine.', 'Return Visit'),
      (3, 2, ?, 'Invited to the meeting.', 'Return Visit')`,
    [
      coreData('2025-03-02T15:00:00Z'),
      coreData('2025-03-16T15:00:00Z'),
      coreData('2025-03-09T15:00:00Z'),
    ]
  )
  db.run(
    `INSERT INTO ZTIMETYPE (Z_PK, ZNAME, ZDIRECTCREDIT) VALUES (1, 'Hours', 0)`
  )
  db.run(
    `INSERT INTO ZTIMEENTRY (Z_PK, ZMINUTES, ZTYPE, ZDATE, ZNOTES) VALUES
      (1, 90, 1, ?, 'Morning service'), (2, 60, 1, ?, 'Evening service')`,
    [coreData('2025-03-02T14:00:00Z'), coreData('2025-03-09T22:00:00Z')]
  )
  db.run(
    `INSERT INTO ZUSER (Z_PK, ZPUBLISHERTYPE, ZPIONEERSTARTDATE, ZNAME)
     VALUES (1, 'Pioneer', ?, 'Sample Publisher')`,
    [coreData('2023-09-01T00:00:00Z')]
  )
  const bytes = db.export()
  db.close()
  return bytes
}
