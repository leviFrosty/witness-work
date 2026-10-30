/* The Help Center's device filter (src/components/help-center/platform-filter.tsx),
   before the page paints: the saved choice, or a guess from the user agent,
   as data-ww-platform on <html>. */
;(function () {
  try {
    var p = localStorage.getItem('ww-help-platform')
    if (p !== 'ios' && p !== 'android' && p !== 'web' && p !== 'all') {
      var u = navigator.userAgent
      p =
        /iPhone|iPad|iPod/.test(u) ||
        (/Macintosh/.test(u) && navigator.maxTouchPoints > 1)
          ? 'ios'
          : /Android/.test(u)
            ? 'android'
            : 'all'
    }
    document.documentElement.setAttribute('data-ww-platform', p)
  } catch (e) {}
})()
