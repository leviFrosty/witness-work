/* /get (src/routes/get.tsx): sends iPhone and iPad (including iPadOS's Mac
   user agent) to the App Store and Android to Google Play before the page
   paints; everything else sees both badges. */
;(function () {
  var ua = navigator.userAgent || ''
  var apple =
    /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (apple)
    location.replace('https://apps.apple.com/app/witnesswork/id6469723047')
  else if (/Android/.test(ua))
    location.replace(
      'https://play.google.com/store/apps/details?id=com.leviwilkerson.jwtime'
    )
})()
