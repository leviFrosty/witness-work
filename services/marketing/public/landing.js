/*
 * Motion for the WitnessWork pages (src/components/landing).
 *
 * Plain script, loaded with <script async> by every page. The pages are
 * static HTML; React hydrates only the Help Center's islands (README.md),
 * none of which this script touches. A MutationObserver also arms whatever
 * is added to the DOM later.
 *
 *   .ww-reveal                fades in once on screen (data-in="true")
 *   [data-ww-progress]        --p: 0 → 1 as it crosses the viewport
 *                             ("sticky": from its top reaching the top of the
 *                             screen to its bottom reaching the bottom)
 *   [data-ww-words]           lights .ww-word spans in step with --p
 *   [data-ww-journey]         marks the step at the middle of the screen
 *   [data-ww-scribe]          plays the Scribe AI demo while on screen
 *   [data-ww-sync]            plays the sync demo while on screen
 *   [data-ww-count]           counts up to data-to once on screen
 *   [data-ww-field]           silk that drifts and leans toward the pointer
 *                             (the hero, the closing call to action, the
 *                             Help Center)
 *   [data-ww-typing]          types [data-ww-typed] out while on screen
 *   [data-ww-nav]             data-scrolled once the page moves
 *   [data-ww-get]             links straight to this device's store
 *   details[data-ww-close]    closes on outside click, Escape, or a link
 *
 * Everything settles at its end state under prefers-reduced-motion.
 */

// The App Store's Support URL was the old landing's #support section. Its
// 301 keeps the fragment, so a landing page opened at #support moves on to
// that language's support page.
;(function () {
  if (location.hash !== '#support') return
  var landing = location.pathname.replace(/\/+$/, '')
  // `/`, `/ar` or `/<ll>-<RR>` (`/de-DE`, `/bem-ZM`), never `/privacy` or `/help`.
  if (/^(\/ar|\/[a-z]{2,3}-[A-Z]{2})?$/.test(landing)) {
    location.replace(landing + '/support')
  }
})()
;(function () {
  var root = document.documentElement
  if (root.hasAttribute('data-ww-engine')) return
  root.setAttribute('data-ww-engine', '')

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)')

  /** @param {number} v */
  var clamp = function (v) {
    return v < 0 ? 0 : v > 1 ? 1 : v
  }

  /** @type {Record<string, WeakSet<Element>>} */
  var seen = {}
  /** @type {{ el: Element; kind: string; stop: () => void }[]} */
  var armed = []
  /**
   * Arms `el` for `kind` the first time it's seen. `start` returns how to stop
   * it again once the element leaves the page.
   *
   * @param {Element} el
   * @param {string} kind
   * @param {(el: Element) => () => void} start
   */
  function arm(el, kind, start) {
    var set = seen[kind] || (seen[kind] = new WeakSet())
    if (set.has(el)) return
    set.add(el)
    armed.push({ el: el, kind: kind, stop: start(el) })
  }
  /** Stops whatever a navigation took off the page, so it can arm again. */
  function prune() {
    armed = armed.filter(function (item) {
      if (item.el.isConnected) return true
      item.stop()
      var set = seen[item.kind]
      if (set) set.delete(item.el)
      return false
    })
  }

  /* --- Reveal ------------------------------------------------------------ */
  var revealIO = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return
        entry.target.setAttribute('data-in', 'true')
        revealIO.unobserve(entry.target)
      })
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
  )

  /* --- Scroll progress ----------------------------------------------------- */
  /** @type {Set<HTMLElement>} */
  var visible = new Set()
  var progressIO = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        var el = /** @type {HTMLElement} */ (entry.target)
        if (entry.isIntersecting) visible.add(el)
        else visible.delete(el)
      })
      schedule()
    },
    { rootMargin: '25% 0px 25% 0px' }
  )

  /** @param {HTMLElement} el */
  function progressOf(el) {
    var rect = el.getBoundingClientRect()
    var vh = window.innerHeight || 1
    if (el.getAttribute('data-ww-progress') === 'sticky') {
      var run = rect.height - vh
      return run > 0 ? clamp(-rect.top / run) : rect.top <= 0 ? 1 : 0
    }
    return clamp((vh - rect.top) / (vh + rect.height))
  }

  /** @type {WeakMap<HTMLElement, NodeListOf<Element>>} */
  var wordLists = new WeakMap()
  /**
   * Lights the words over the middle of the pass, so the last one turns on
   * while the sentence is still comfortably on screen.
   *
   * @param {HTMLElement} el
   * @param {number} p
   */
  function words(el, p) {
    var list = wordLists.get(el)
    if (!list) {
      list = el.querySelectorAll('.ww-word')
      wordLists.set(el, list)
    }
    var lit = Math.round(clamp((p - 0.18) / 0.4) * list.length)
    list.forEach(function (word, i) {
      if (i < lit) word.setAttribute('data-on', '')
      else word.removeAttribute('data-on')
    })
  }

  var frame = 0
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update)
  }
  function update() {
    frame = 0
    visible.forEach(function (el) {
      if (!el.isConnected) {
        visible.delete(el)
        return
      }
      var p = reduce.matches ? 1 : progressOf(el)
      el.style.setProperty('--p', p.toFixed(4))
      if (el.hasAttribute('data-ww-words')) words(el, p)
    })
    var nav = document.querySelector('[data-ww-nav]')
    if (nav) {
      if (window.scrollY > 8) nav.setAttribute('data-scrolled', '')
      else nav.removeAttribute('data-scrolled')
    }
  }
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule, { passive: true })

  /* --- Journey: the step nearest the middle of the screen -------------------- */
  /** @param {Element} journey */
  function armJourney(journey) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return
          var index = entry.target.getAttribute('data-ww-step') || '0'
          journey.setAttribute('data-active', index)
          journey
            .querySelectorAll('[data-ww-step],[data-ww-stage-item]')
            .forEach(function (item) {
              var own =
                item.getAttribute('data-ww-step') ||
                item.getAttribute('data-ww-stage-item')
              if (own === index) item.setAttribute('data-active', '')
              else item.removeAttribute('data-active')
            })
        })
      },
      { rootMargin: '-48% 0px -48% 0px' }
    )
    journey.querySelectorAll('[data-ww-step]').forEach(function (step) {
      io.observe(step)
    })
    return function () {
      io.disconnect()
    }
  }

  /* --- Demos that play while on screen ---------------------------------------- */
  /**
   * @param {Element} el
   * @param {() => void} start
   * @param {() => void} stop
   */
  function whileVisible(el, start, stop) {
    var running = false
    var io = new IntersectionObserver(
      function (entries) {
        var last = entries[entries.length - 1]
        var on = !!last && last.isIntersecting
        if (on && !running) {
          running = true
          el.setAttribute('data-play', '')
          start()
        } else if (!on && running) {
          running = false
          el.removeAttribute('data-play')
          stop()
        }
      },
      { threshold: 0.35 }
    )
    io.observe(el)
    return function () {
      io.disconnect()
      if (running) {
        running = false
        stop()
      }
    }
  }

  /** Timers a demo can cancel all at once. */
  function timerSet() {
    /** @type {ReturnType<typeof setTimeout>[]} */
    var timers = []
    return {
      /**
       * @param {number} ms
       * @param {() => void} fn
       */
      later: function (ms, fn) {
        timers.push(setTimeout(fn, ms))
      },
      clear: function () {
        timers.forEach(clearTimeout)
        timers = []
      },
    }
  }

  /**
   * Scribe AI: listen → type what was said → think → cards → added.
   *
   * @param {Element} el
   */
  function armScribe(el) {
    var typed = el.querySelector('[data-ww-type]')
    var full = (typed && typed.getAttribute('data-ww-type')) || ''
    var chars = Array.from(full)
    var timers = timerSet()
    /** @param {number} n */
    var step = function (n) {
      el.setAttribute('data-step', String(n))
    }
    /** @param {string} text */
    var type = function (text) {
      if (typed) typed.textContent = text
    }
    function run() {
      timers.clear()
      el.removeAttribute('data-tap')
      if (reduce.matches) {
        type(full)
        step(4)
        return
      }
      step(0)
      type('')
      var perChar = Math.max(18, Math.min(42, 2600 / Math.max(chars.length, 1)))
      timers.later(700, function () {
        step(1)
        chars.forEach(function (_, i) {
          timers.later(i * perChar, function () {
            type(chars.slice(0, i + 1).join(''))
          })
        })
        timers.later(chars.length * perChar + 500, function () {
          step(2)
          timers.later(1100, function () {
            step(3)
            // A tap on Add, then it's added: nothing is added without one.
            timers.later(1900, function () {
              el.setAttribute('data-tap', '')
              timers.later(420, function () {
                el.removeAttribute('data-tap')
                step(4)
                timers.later(4200, run)
              })
            })
          })
        })
      })
    }
    return whileVisible(el, run, function () {
      timers.clear()
      type(full)
      step(4)
    })
  }

  /**
   * Sync: a watch logs time, it travels, every screen catches up.
   *
   * @param {Element} el
   */
  function armSync(el) {
    var timers = timerSet()
    /** @param {string} name */
    var phase = function (name) {
      el.setAttribute('data-phase', name)
    }
    function run() {
      timers.clear()
      if (reduce.matches) {
        phase('done')
        return
      }
      phase('idle')
      timers.later(900, function () {
        phase('tap')
      })
      timers.later(1900, function () {
        phase('send')
      })
      timers.later(3300, function () {
        phase('done')
      })
      timers.later(7600, run)
    }
    return whileVisible(el, run, function () {
      timers.clear()
      phase('done')
    })
  }

  /**
   * Counts a number up from zero the first time it's on screen.
   *
   * @param {Element} el
   */
  function armCount(el) {
    var io = new IntersectionObserver(
      function (entries) {
        if (!entries[0] || !entries[0].isIntersecting) return
        io.disconnect()
        if (reduce.matches) return
        var to = parseFloat(el.getAttribute('data-to') || '0')
        var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10)
        var format = new Intl.NumberFormat(root.lang || undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
        var prefix = el.getAttribute('data-prefix') || ''
        var suffix = el.getAttribute('data-suffix') || ''
        var final = el.textContent
        var start = performance.now()
        /** @param {number} now */
        var tick = function (now) {
          if (!el.isConnected) return
          var t = clamp((now - start) / 1400)
          var eased = 1 - Math.pow(1 - t, 4)
          el.textContent = prefix + format.format(to * eased) + suffix
          if (t < 1) requestAnimationFrame(tick)
          else el.textContent = final
        }
        tick(start)
      },
      { threshold: 0.6 }
    )
    io.observe(el)
    return function () {
      io.disconnect()
    }
  }

  /* --- The field: silk that leans toward the pointer ---------------------------
     Codex's hero, in WitnessWork's greens: a small WebGL shader drawn at half
     resolution (it's soft anyway), run only while on screen. */
  var SILK_VERT =
    'attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0.,1.);}'
  var SILK_FRAG = [
    'precision mediump float;',
    'varying vec2 v;',
    'uniform vec2 r;',
    'uniform float t;',
    'uniform vec2 m;',
    'uniform float e;',
    'float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    'return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}',
    'float tt;',
    // The cloth: two crossing waves, bent by slow noise.
    'float H(vec2 p){',
    '  float a=n(p*.9+vec2(tt,-tt*.7));',
    '  float b=n(p*.7+vec2(3.1-tt*.6,1.7+tt));',
    '  return sin(p.x*2.4+p.y*1.3+a*4.5)*.6+sin(p.x*.9-p.y*2.1+b*3.5)*.4;',
    '}',
    'void main(){',
    '  tt=t*.05;',
    '  float k=r.x/r.y;',
    '  vec2 p=vec2(v.x*k,v.y)*2.1;',
    '  vec2 d=p-vec2(m.x*k,m.y)*2.1;',
    '  float near=exp(-dot(d,d)*1.6);',
    // It gathers toward the pointer.
    '  p-=d*near*(.07+.11*e);',
    // Light it like satin: soft sheen on the folds, a brighter glint on top.
    '  float s=.012;',
    '  float hx=H(p+vec2(s,0.))-H(p-vec2(s,0.));',
    '  float hy=H(p+vec2(0.,s))-H(p-vec2(0.,s));',
    '  vec3 N=normalize(vec3(-hx,-hy,s*4.2));',
    '  vec3 L=normalize(vec3(-.35,.55,.75));',
    '  float dif=max(dot(N,L),0.);',
    '  float spe=pow(max(dot(reflect(-L,N),vec3(0.,0.,1.)),0.),7.);',
    '  vec3 c=vec3(.008,.018,.012);',
    '  c+=vec3(.015,.10,.055)*dif;',
    '  c+=vec3(.05,.34,.18)*pow(dif,6.)*.8;',
    '  c+=vec3(.10,.55,.30)*spe*.45;',
    '  c+=vec3(.55,1.,.8)*pow(spe,5.)*.22;',
    '  c+=vec3(.04,.26,.14)*near*(.14+.3*e);',
    // Calm behind the headline, and fade toward the edges.
    '  float calm=smoothstep(.6,0.,length((v-vec2(.5,.8))*vec2(1.1,2.6)));',
    '  float g=smoothstep(1.4,.2,length((v-vec2(.5,.7))*vec2(1.,1.3)));',
    '  c*=(.35+.65*g)*(1.-.5*calm)*.8;',
    '  gl_FragColor=vec4(c,1.);',
    '}',
  ].join('\n')

  /**
   * @param {HTMLCanvasElement} canvas
   * @returns {{
   *   resize: (w: number, h: number) => void
   *   draw: (time: number, x: number, y: number, energy: number) => void
   *   stop: () => void
   * } | null}
   */
  function startSilk(canvas) {
    /** @type {WebGLRenderingContext | null} */
    var gl = null
    try {
      gl = /** @type {WebGLRenderingContext | null} */ (
        canvas.getContext('webgl', {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          powerPreference: 'low-power',
        })
      )
    } catch (_) {
      gl = null
    }
    if (!gl) return null
    var g = gl
    /**
     * @param {number} type
     * @param {string} source
     */
    var compile = function (type, source) {
      var shader = g.createShader(type)
      if (!shader) return null
      g.shaderSource(shader, source)
      g.compileShader(shader)
      return g.getShaderParameter(shader, g.COMPILE_STATUS) ? shader : null
    }
    var vs = compile(g.VERTEX_SHADER, SILK_VERT)
    var fs = compile(g.FRAGMENT_SHADER, SILK_FRAG)
    var program = g.createProgram()
    if (!vs || !fs || !program) return null
    g.attachShader(program, vs)
    g.attachShader(program, fs)
    g.linkProgram(program)
    if (!g.getProgramParameter(program, g.LINK_STATUS)) return null
    g.useProgram(program)
    g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer())
    g.bufferData(
      g.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      g.STATIC_DRAW
    )
    var at = g.getAttribLocation(program, 'a')
    g.enableVertexAttribArray(at)
    g.vertexAttribPointer(at, 2, g.FLOAT, false, 0, 0)
    var uRes = g.getUniformLocation(program, 'r')
    var uTime = g.getUniformLocation(program, 't')
    var uPointer = g.getUniformLocation(program, 'm')
    var uEnergy = g.getUniformLocation(program, 'e')
    var lost = false
    canvas.addEventListener('webglcontextlost', function () {
      lost = true
      // The canvas is opaque: hide it so the CSS glow behind it shows again.
      if (canvas.parentElement)
        canvas.parentElement.removeAttribute('data-ready')
    })
    return {
      resize: function (w, h) {
        canvas.width = Math.max(1, Math.round(w * 0.5))
        canvas.height = Math.max(1, Math.round(h * 0.5))
        g.viewport(0, 0, canvas.width, canvas.height)
      },
      draw: function (time, x, y, energy) {
        if (lost) return
        g.uniform2f(uRes, canvas.width, canvas.height)
        g.uniform1f(uTime, time)
        g.uniform2f(uPointer, x, 1 - y)
        g.uniform1f(uEnergy, energy)
        g.drawArrays(g.TRIANGLE_STRIP, 0, 4)
      },
      stop: function () {
        var ext = g.getExtension('WEBGL_lose_context')
        if (ext) ext.loseContext()
      },
    }
  }

  /** @param {Element} field */
  function armField(field) {
    var host = /** @type {HTMLElement} */ (field.parentElement || field)
    var silkCanvas = /** @type {HTMLCanvasElement | null} */ (
      field.querySelector('.ww-field-silk')
    )
    var still = reduce.matches
    var silk = silkCanvas ? startSilk(silkCanvas) : null
    var coarse = window.matchMedia('(pointer: coarse)').matches
    var pointer = { x: 0.5, y: 0.3, tx: 0.5, ty: 0.3, energy: 0 }
    var raf = 0
    var running = false
    var started = performance.now()
    var last = 0
    var tick = 0

    function size() {
      var rect = field.getBoundingClientRect()
      if (silk) silk.resize(rect.width, rect.height)
      if (silk && !running) silk.draw(4, pointer.x, pointer.y, 0)
    }
    var resizer = new ResizeObserver(size)
    resizer.observe(field)
    if (silk) {
      size()
      field.setAttribute('data-ready', '')
    }

    /**
     * @param {number} clientX
     * @param {number} clientY
     */
    function point(clientX, clientY) {
      var rect = field.getBoundingClientRect()
      pointer.tx = (clientX - rect.left) / rect.width
      pointer.ty = (clientY - rect.top) / rect.height
      pointer.energy = 1
      wake()
    }
    /** @param {PointerEvent} event */
    var onPointer = function (event) {
      if (event.pointerType !== 'touch') point(event.clientX, event.clientY)
    }
    /** @param {TouchEvent} event */
    var onTouch = function (event) {
      var touch = event.touches[0]
      if (touch) point(touch.clientX, touch.clientY)
    }
    if (!still) {
      host.addEventListener('pointermove', onPointer, { passive: true })
      host.addEventListener('touchmove', onTouch, { passive: true })
    }

    /** @param {number} now */
    function frame(now) {
      raf = 0
      if (!running) return
      var dt = Math.min(64, last ? now - last : 16.7)
      last = now
      // It follows the pointer unhurried, and settles once it stops.
      var ease = Math.min(1, dt * 0.0028)
      pointer.x += (pointer.tx - pointer.x) * ease
      pointer.y += (pointer.ty - pointer.y) * ease
      pointer.energy *= Math.pow(0.9988, dt)
      // Phones draw the silk at 30 fps; it moves slowly anyway.
      tick++
      if (silk && (!coarse || tick % 2 === 0)) {
        silk.draw((now - started) / 1000, pointer.x, pointer.y, pointer.energy)
      }
      raf = requestAnimationFrame(frame)
    }
    function wake() {
      if (running && !raf) raf = requestAnimationFrame(frame)
    }
    function start() {
      if (still || running || document.hidden) return
      running = true
      last = 0
      wake()
    }
    function stop() {
      running = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }
    var onScreen = false
    var seenIO = new IntersectionObserver(function (entries) {
      var entry = entries[entries.length - 1]
      onScreen = !!entry && entry.isIntersecting
      if (onScreen) start()
      else stop()
    })
    seenIO.observe(field)
    var onVisibility = function () {
      if (document.hidden) stop()
      else if (onScreen) start()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return function () {
      stop()
      seenIO.disconnect()
      resizer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      host.removeEventListener('pointermove', onPointer)
      host.removeEventListener('touchmove', onTouch)
      if (silk) silk.stop()
    }
  }

  /**
   * A note types itself out, then shows the next visit (T3 Code's typing demos,
   * in the app's own note style).
   *
   * @param {Element} card
   */
  function armTyping(card) {
    var typed = card.querySelector('[data-ww-typed]')
    var chars = Array.from((typed && typed.getAttribute('data-ww-typed')) || '')
    var timers = timerSet()
    /** @param {number} n */
    var show = function (n) {
      if (typed) typed.textContent = chars.slice(0, n).join('')
    }
    var done = function () {
      show(chars.length)
      card.setAttribute('data-done', '')
    }
    function run() {
      timers.clear()
      if (reduce.matches) {
        done()
        return
      }
      card.removeAttribute('data-done')
      show(0)
      var at = 600
      chars.forEach(function (_, i) {
        // A beat after each sentence, like someone thinking as they type.
        at += /[.!?。！？]/.test(chars[i - 1] || '')
          ? 320
          : 26 + Math.random() * 40
        timers.later(at, function () {
          show(i + 1)
        })
      })
      timers.later(at + 450, function () {
        card.setAttribute('data-done', '')
        timers.later(6000, run)
      })
    }
    return whileVisible(card, run, function () {
      timers.clear()
      done()
    })
  }

  /* --- "Get the app" goes straight to this device's store ---------------------- */
  var ua = navigator.userAgent || ''
  var apple =
    /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  var android = /Android/.test(ua)
  /** @param {Element} link */
  function armGet(link) {
    var store = document.querySelector(
      apple
        ? '#download a[href*="apps.apple.com"]'
        : '#download a[href*="play.google.com"]'
    )
    var href = store && store.getAttribute('href')
    if (href) link.setAttribute('href', href)
    return function () {}
  }

  /* --- Menus ------------------------------------------------------------------ */
  document.addEventListener('click', function (event) {
    var target = /** @type {Element | null} */ (event.target)
    document
      .querySelectorAll('details[data-ww-close][open]')
      .forEach(function (menu) {
        var inside = !!target && menu.contains(target)
        var link = inside && target && target.closest('a')
        if (!inside || link) menu.removeAttribute('open')
      })
  })
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return
    document
      .querySelectorAll('details[data-ww-close][open]')
      .forEach(function (menu) {
        menu.removeAttribute('open')
        var summary = /** @type {HTMLElement | null} */ (
          menu.querySelector('summary')
        )
        if (summary) summary.focus()
      })
  })

  /* --- Keep the focused tab's label on screen -------------------------------------
     The device tabs are radios; the arrow keys move between them, but their
     labels scroll in a strip of their own on narrow screens. */
  document.addEventListener('focusin', function (event) {
    var input = event.target
    if (!(input instanceof HTMLInputElement) || input.type !== 'radio') return
    if (!input.id) return
    var label = document.querySelector('label[for="' + input.id + '"]')
    if (label) label.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })

  /* --- Arm whatever is on the page ------------------------------------------------ */
  /** @param {Element} el */
  function reveal(el) {
    if (el.getAttribute('data-in') !== 'true') revealIO.observe(el)
    return function () {
      revealIO.unobserve(el)
    }
  }
  /** @param {Element} el */
  function progress(el) {
    progressIO.observe(el)
    return function () {
      progressIO.unobserve(el)
      visible.delete(/** @type {HTMLElement} */ (el))
    }
  }

  function scan() {
    prune()
    /** @type {[string, string, (el: Element) => () => void][]} */
    var kinds = [
      ['.ww-reveal', 'reveal', reveal],
      ['[data-ww-progress]', 'progress', progress],
      ['[data-ww-journey]', 'journey', armJourney],
      ['[data-ww-scribe]', 'scribe', armScribe],
      ['[data-ww-sync]', 'sync', armSync],
      ['[data-ww-count]', 'count', armCount],
      ['[data-ww-field]', 'field', armField],
      ['[data-ww-typing]', 'typing', armTyping],
    ]
    if (apple || android) kinds.push(['[data-ww-get]', 'get', armGet])
    kinds.forEach(function (kind) {
      document.querySelectorAll(kind[0]).forEach(function (el) {
        arm(el, kind[1], kind[2])
      })
    })
    schedule()
  }

  /** @param {Node} node */
  var isElement = function (node) {
    return node.nodeType === 1
  }
  var pending = false
  new MutationObserver(function (records) {
    // Text the demos type and count doesn't need a rescan; elements do.
    var changed = records.some(function (record) {
      return (
        Array.prototype.some.call(record.addedNodes, isElement) ||
        Array.prototype.some.call(record.removedNodes, isElement)
      )
    })
    if (!changed || pending) return
    pending = true
    requestAnimationFrame(function () {
      pending = false
      scan()
    })
  }).observe(root, { childList: true, subtree: true })
  window.addEventListener('pageshow', scan)
  scan()
})()
