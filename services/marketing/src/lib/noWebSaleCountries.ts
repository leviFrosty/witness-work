export const EU_27_COUNTRIES =
  'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(
    ' '
  )

export const NO_WEB_SALE_COUNTRIES = [
  ...EU_27_COUNTRIES,

  'GB',

  ...'IM MC'.split(' '),

  ...'AX GF GP MQ MF RE YT'.split(' '),

  ...'AL AO AM AW BS BH BD CM CL CO GE GH GN IN CI KZ KE KG LA MR MX MD ME MA MK OM PE RU SA SN RS KR TJ TZ TR AE UY UZ VN'.split(
    ' '
  ),
]

export const NO_WEB_SALE_REGIONS: Record<string, string[]> = {
  CA: 'MB SK'.split(' '),
}
