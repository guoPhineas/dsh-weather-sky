/**
 * Weather & Sky — Client half (browser-only).
 *
 * Fetches live weather from Open-Meteo directly in the browser, geolocates the
 * user (navigator.geolocation → ipwho.is fallback), and renders a full-screen,
 * pointer-transparent animated overlay: sun by day, moon with phases by night,
 * clouds, rain, snow, fog, and periodic lightning.
 */
import type { Context } from '@deepseek-ai/cordis'

type WeatherCondition = 'clear' | 'partly-cloudy' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'thunderstorm'

interface WeatherSnapshot {
  location: string
  condition: WeatherCondition
  intensity: number
  label: string
  isDay: boolean
  tempC: number | null
  moonPhase: number
  moonLabel: string
  sunArc: number
  moonArc: number
}

interface GeoPoint {
  name: string
  latitude: number
  longitude: number
}

const CSS = `
.ws-sky{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:2147483000;}
.ws-sky *{pointer-events:none;box-sizing:border-box;}
.ws-layer{position:absolute;inset:0;overflow:hidden;}
.ws-tint{position:absolute;inset:0;transition:opacity 2s ease;}
.ws-celestial{position:absolute;width:96px;height:96px;transform:translate(-50%,-50%);opacity:.75;}
.ws-sun{position:absolute;top:12px;left:12px;width:72px;height:72px;border-radius:50%;
  background:radial-gradient(circle at 35% 35%,#fff8d8,#ffd54f 55%,#ffb300);
  box-shadow:0 0 40px 16px rgba(255,200,80,.5),0 0 90px 40px rgba(255,180,60,.22);
  animation:ws-sun-pulse 5s ease-in-out infinite;}
@keyframes ws-sun-pulse{0%,100%{transform:scale(1);opacity:.9}50%{transform:scale(1.07);opacity:1}}
.ws-moon{position:absolute;top:15px;left:15px;width:66px;height:66px;border-radius:50%;
  background:radial-gradient(circle at 40% 38%,#f5f7ff,#ccd4ee 58%,#a7b0d4);}
.ws-star{position:absolute;border-radius:50%;background:#fff;animation:ws-twinkle 3s ease-in-out infinite;}
@keyframes ws-twinkle{0%,100%{opacity:.12}50%{opacity:.85}}
.ws-cloud{position:absolute;background:rgba(255,255,255,.55);border-radius:100px;filter:blur(3px);animation:ws-drift linear infinite;}
.ws-cloud.dark{background:rgba(88,96,124,.5);}
.ws-cloud .puff{position:absolute;background:inherit;border-radius:50%;}
.ws-cloud .p1{width:56%;height:140%;left:10%;top:-64%;}
.ws-cloud .p2{width:46%;height:128%;left:42%;top:-46%;}
.ws-cloud .p3{width:62%;height:118%;left:26%;top:-32%;}
@keyframes ws-drift{from{transform:translateX(-35vw)}to{transform:translateX(135vw)}}
.ws-rain{position:absolute;top:-8%;width:2px;border-radius:2px;
  background:linear-gradient(to bottom,rgba(160,195,255,0),rgba(140,180,250,.85));animation:ws-rain linear infinite;}
@keyframes ws-rain{to{transform:translateY(120vh)}}
.ws-snow{position:absolute;top:-6%;border-radius:50%;background:#fff;opacity:.85;animation:ws-snow linear infinite;}
@keyframes ws-snow{0%{transform:translate(0,0)}100%{transform:translate(34px,120vh)}}
.ws-flash-screen{position:absolute;inset:0;background:rgba(210,225,255,.18);opacity:0;}
.ws-flash-screen.flash{animation:ws-flash 1.7s ease-out;}
.ws-bolt{position:absolute;top:0;left:0;width:100%;height:62%;opacity:0;}
.ws-bolt.flash{animation:ws-flash 1.7s ease-out;}
@keyframes ws-flash{0%{opacity:0}5%{opacity:.95}9%{opacity:.15}13%{opacity:.8}20%{opacity:0}100%{opacity:0}}
.ws-fog{position:absolute;left:-12%;right:-12%;height:130px;border-radius:50%;
  background:radial-gradient(ellipse at center,rgba(222,227,238,.5),rgba(222,227,238,0));
  filter:blur(12px);animation:ws-fog 20s ease-in-out infinite;}
@keyframes ws-fog{0%,100%{transform:translateX(-5%)}50%{transform:translateX(5%)}}
.ws-chip{position:fixed;right:14px;bottom:14px;display:flex;align-items:center;gap:7px;
  max-width:300px;padding:7px 11px;border-radius:999px;font-size:12px;line-height:1.2;color:rgba(255,255,255,.92);
  background:rgba(18,24,44,.38);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  border:1px solid rgba(255,255,255,.14);box-shadow:0 4px 18px rgba(0,0,0,.18);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ws-chip-icon{font-size:15px;line-height:1;}
.ws-chip-text{overflow:hidden;text-overflow:ellipsis;}
`

// --- pure helpers -----------------------------------------------------------

function conditionFromCode(code: number): { condition: WeatherCondition; intensity: number } {
  if (code === 0) return { condition: 'clear', intensity: 0 }
  if (code === 1 || code === 2) return { condition: 'partly-cloudy', intensity: 0 }
  if (code === 3) return { condition: 'cloudy', intensity: 0 }
  if (code === 45 || code === 48) return { condition: 'fog', intensity: 0 }
  if (code >= 51 && code <= 57) return { condition: 'rain', intensity: 0.25 }
  if (code === 61) return { condition: 'rain', intensity: 0.3 }
  if (code === 63) return { condition: 'rain', intensity: 0.55 }
  if (code === 65) return { condition: 'rain', intensity: 0.9 }
  if (code === 66 || code === 67) return { condition: 'rain', intensity: 0.6 }
  if (code === 71) return { condition: 'snow', intensity: 0.3 }
  if (code === 73) return { condition: 'snow', intensity: 0.6 }
  if (code === 75) return { condition: 'snow', intensity: 0.9 }
  if (code === 77) return { condition: 'snow', intensity: 0.4 }
  if (code === 80) return { condition: 'rain', intensity: 0.4 }
  if (code === 81) return { condition: 'rain', intensity: 0.7 }
  if (code === 82) return { condition: 'rain', intensity: 0.95 }
  if (code === 85) return { condition: 'snow', intensity: 0.5 }
  if (code === 86) return { condition: 'snow', intensity: 0.8 }
  if (code === 95) return { condition: 'thunderstorm', intensity: 0.7 }
  if (code === 96 || code === 99) return { condition: 'thunderstorm', intensity: 0.95 }
  return { condition: 'clear', intensity: 0 }
}

function labelFor(condition: WeatherCondition, intensity: number): string {
  if (condition === 'rain') {
    if (intensity < 0.35) return '小雨'
    if (intensity < 0.65) return '中雨'
    return '大雨'
  }
  if (condition === 'snow') {
    if (intensity < 0.35) return '小雪'
    if (intensity < 0.65) return '中雪'
    return '大雪'
  }
  const m: Record<WeatherCondition, string> = { clear: '晴', 'partly-cloudy': '局部多云', cloudy: '阴', fog: '雾', rain: '雨', snow: '雪', thunderstorm: '雷阵雨' }
  return m[condition] ?? condition
}

function moonPhaseFraction(date: Date): number {
  const synodic = 29.53058867
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14, 0)
  const days = (date.getTime() - knownNewMoon) / 86400000
  return (((days % synodic) + synodic) % synodic) / synodic
}

function moonLabel(f: number): string {
  if (f < 0.03 || f > 0.97) return '新月'
  if (f < 0.22) return '娥眉月'
  if (f < 0.28) return '上弦月'
  if (f < 0.47) return '盈凸月'
  if (f < 0.53) return '满月'
  if (f < 0.72) return '亏凸月'
  if (f < 0.78) return '下弦月'
  return '残月'
}

function solarFacts(lat: number, lon: number, date: Date): { solarHours: number; sunrise: number; sunset: number } {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth()
  const d = date.getUTCDate()
  const dayOfYear = Math.floor((Date.UTC(y, m, d) - Date.UTC(y, 0, 0)) / 86400000)
  const decl = 23.45 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81))
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  const solarHours = utcHours + lon / 15
  const cosH = -Math.tan(lat * Math.PI / 180) * Math.tan(decl * Math.PI / 180)
  const H = cosH > 1 ? 0 : (cosH < -1 ? 180 : Math.acos(cosH) * 180 / Math.PI)
  const halfDay = H / 15
  return { solarHours, sunrise: 12 - halfDay, sunset: 12 + halfDay }
}

function isDaytime(lat: number, lon: number, date: Date): boolean {
  const f = solarFacts(lat, lon, date)
  return f.solarHours > f.sunrise && f.solarHours < f.sunset
}

function clamp01(v: number): number {
  return v < 0 ? 0 : (v > 1 ? 1 : v)
}

function computeArcs(lat: number, lon: number, date: Date, phase: number): { sunArc: number; moonArc: number } {
  const f = solarFacts(lat, lon, date)
  let sun = 0.5
  const dayLen = f.sunset - f.sunrise
  if (dayLen > 0.02) sun = (f.solarHours - f.sunrise) / dayLen
  const transit = (12 + 24 * phase) % 24
  const moonRise = transit - 6
  const moon = (f.solarHours - moonRise) / 12
  return { sunArc: clamp01(sun), moonArc: clamp01(moon) }
}

function conditionIcon(condition: WeatherCondition, isDay: boolean): string {
  if (condition === 'clear') return isDay ? '☀️' : '🌙'
  if (condition === 'partly-cloudy') return isDay ? '⛅' : '☁️'
  if (condition === 'cloudy') return '☁️'
  if (condition === 'fog') return '🌫️'
  if (condition === 'rain') return '🌧️'
  if (condition === 'snow') return '❄️'
  if (condition === 'thunderstorm') return '⛈️'
  return '🌤️'
}

// --- networking -------------------------------------------------------------

async function locate(): Promise<GeoPoint | null> {
  if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 300000 })
      })
      return { name: '当前位置', latitude: pos.coords.latitude, longitude: pos.coords.longitude }
    } catch {
      // fall through to IP geolocation
    }
  }
  try {
    const res = await fetch('https://ipwho.is/', { mode: 'cors' })
    if (!res.ok) return null
    const data = await res.json()
    if (data && data.success !== false && data.latitude != null && data.longitude != null) {
      return { name: data.city || data.region || '当前位置', latitude: data.latitude, longitude: data.longitude }
    }
  } catch {
    // ignore
  }
  return null
}

async function fetchWeather(geo: GeoPoint): Promise<WeatherSnapshot> {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + geo.latitude + '&longitude=' + geo.longitude
    + '&current=weather_code,temperature_2m,is_day,precipitation,cloud_cover,wind_speed_10m&timezone=auto'
  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok) throw new Error('weather HTTP ' + res.status)
  const data = await res.json()
  const cur = data?.current
  if (!cur) throw new Error('empty weather data')
  const c = conditionFromCode(cur.weather_code)
  const now = new Date()
  const moonF = moonPhaseFraction(now)
  const arcs = computeArcs(geo.latitude, geo.longitude, now, moonF)
  return {
    location: geo.name,
    condition: c.condition,
    intensity: c.intensity,
    label: labelFor(c.condition, c.intensity),
    isDay: cur.is_day === 1,
    tempC: cur.temperature_2m == null ? null : Math.round(cur.temperature_2m),
    moonPhase: Math.round(moonF * 100) / 100,
    moonLabel: moonLabel(moonF),
    sunArc: Math.round(arcs.sunArc * 1000) / 1000,
    moonArc: Math.round(arcs.moonArc * 1000) / 1000,
  }
}

// --- DOM rendering ----------------------------------------------------------

function el(tag: string, className?: string, style?: Record<string, string>): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (style) Object.assign(node.style, style)
  return node
}

function makeRain(intensity: number): HTMLElement {
  const layer = el('div', 'ws-layer')
  const count = Math.round(28 + intensity * 92)
  for (let i = 0; i < count; i++) {
    const len = 14 + intensity * 26 + Math.random() * 12
    const dur = (0.55 + (1 - intensity) * 0.95) * (0.7 + Math.random() * 0.6)
    layer.append(el('span', 'ws-rain', {
      left: `${Math.random() * 100}%`,
      height: `${len.toFixed(0)}px`,
      animationDuration: `${dur.toFixed(2)}s`,
      animationDelay: `${(-Math.random() * dur).toFixed(2)}s`,
      opacity: (0.32 + intensity * 0.38 + Math.random() * 0.16).toFixed(2),
    }))
  }
  return layer
}

function makeSnow(intensity: number): HTMLElement {
  const layer = el('div', 'ws-layer')
  const count = Math.round(22 + intensity * 58)
  for (let i = 0; i < count; i++) {
    const s = 3 + Math.random() * 5
    const dur = (3 + (1 - intensity) * 4) * (0.7 + Math.random() * 0.7)
    layer.append(el('span', 'ws-snow', {
      left: `${Math.random() * 100}%`,
      width: `${s.toFixed(1)}px`,
      height: `${s.toFixed(1)}px`,
      animationDuration: `${dur.toFixed(2)}s`,
      animationDelay: `${(-Math.random() * dur).toFixed(2)}s`,
      opacity: (0.5 + Math.random() * 0.4).toFixed(2),
    }))
  }
  return layer
}

function makeStars(): HTMLElement {
  const layer = el('div', 'ws-layer')
  for (let i = 0; i < 70; i++) {
    const s = 1 + Math.random() * 2
    layer.append(el('span', 'ws-star', {
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 60}%`,
      width: `${s.toFixed(1)}px`,
      height: `${s.toFixed(1)}px`,
      animationDuration: `${(2 + Math.random() * 3).toFixed(1)}s`,
      animationDelay: `${(-Math.random() * 3).toFixed(1)}s`,
      opacity: (0.3 + Math.random() * 0.6).toFixed(2),
    }))
  }
  return layer
}

function makeCloud(count: number, dark: boolean): HTMLElement {
  const layer = el('div', 'ws-layer')
  for (let i = 0; i < count; i++) {
    const w = 90 + Math.random() * 170
    const dur = 55 + Math.random() * 70
    const cloud = el('div', 'ws-cloud' + (dark ? ' dark' : ''), {
      width: `${w.toFixed(0)}px`,
      height: `${(w * 0.42).toFixed(0)}px`,
      top: `${3 + Math.random() * 30}%`,
      animationDuration: `${dur.toFixed(1)}s`,
      animationDelay: `${(-Math.random() * dur).toFixed(1)}s`,
      opacity: (0.34 + Math.random() * 0.3).toFixed(2),
    })
    cloud.append(el('span', 'puff p1'), el('span', 'puff p2'), el('span', 'puff p3'))
    layer.append(cloud)
  }
  return layer
}

function makeCelestial(wx: WeatherSnapshot): HTMLElement {
  const arc = wx.isDay ? wx.sunArc : wx.moonArc
  const a = typeof arc === 'number' ? clamp01(arc) : 0.5
  const container = el('div', 'ws-celestial', {
    left: `${8 + a * 84}%`,
    top: `${60 - 40 * Math.sin(a * Math.PI)}%`,
  })
  if (wx.isDay) {
    container.append(el('div', 'ws-sun'))
  } else {
    const f = ((wx.moonPhase % 1) + 1) % 1
    const illum = (1 - Math.cos(2 * Math.PI * f)) / 2
    const glow = '0 0 34px 10px rgba(205,214,255,.38)'
    let shadow: string | null = null
    if (illum <= 0.96) {
      if (illum < 0.04) shadow = 'inset 0 0 0 44px rgba(13,15,36,.93)'
      else {
        const off = Math.round((1 - illum) * 70) + 4
        const side = f < 0.5 ? 1 : -1
        shadow = `inset ${side * off}px 0 0 ${-Math.round(off * 0.5)}px rgba(13,15,36,.9)`
      }
    }
    container.append(el('div', 'ws-moon', { boxShadow: shadow ? `${glow}, ${shadow}` : glow }))
  }
  return container
}

function makeFog(): HTMLElement {
  const layer = el('div', 'ws-layer')
  layer.append(
    el('div', 'ws-fog', { top: '-50px' }),
    el('div', 'ws-fog', { bottom: '20px', animationDelay: '-9s' }),
    el('div', 'ws-fog', { bottom: '150px', animationDelay: '-15s', opacity: '0.5' }),
  )
  return layer
}

function makeLightning(): HTMLElement {
  const layer = el('div', 'ws-layer')
  layer.append(el('div', 'ws-flash-screen flash'))
  const bolt = el('div', 'ws-bolt flash')
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 600 520')
  svg.setAttribute('preserveAspectRatio', 'none')
  const points = '300,0 258,150 318,172 238,330 296,344 248,520'
  const strokes: Array<[string, string, string]> = [
    ['rgba(205,226,255,.92)', '6', 'drop-shadow(0 0 14px rgba(190,220,255,.9))'],
    ['rgba(255,255,255,.95)', '2', ''],
  ]
  for (const [stroke, width, filter] of strokes) {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
    poly.setAttribute('points', points)
    poly.setAttribute('fill', 'none')
    poly.setAttribute('stroke', stroke)
    poly.setAttribute('stroke-width', width)
    poly.setAttribute('stroke-linejoin', 'round')
    if (filter) poly.setAttribute('style', `filter:${filter}`)
    svg.append(poly)
  }
  bolt.append(svg)
  layer.append(bolt)
  return layer
}

function makeChip(wx: WeatherSnapshot): HTMLElement {
  const chip = el('div', 'ws-chip')
  const icon = el('span', 'ws-chip-icon')
  icon.textContent = conditionIcon(wx.condition, wx.isDay)
  const text = el('span', 'ws-chip-text')
  const temp = wx.tempC == null ? '' : `${wx.tempC}°C`
  const moonText = !wx.isDay && wx.moonLabel ? ` · ${wx.moonLabel}` : ''
  text.textContent = `${[wx.location, temp, wx.label].filter(Boolean).join(' · ')}${moonText}`
  chip.append(icon, text)
  return chip
}

function render(wx: WeatherSnapshot): HTMLElement {
  const root = el('div', 'ws-sky')

  const tint = el('div', 'ws-tint', {
    background: wx.isDay
      ? 'linear-gradient(180deg, rgba(120,180,255,.12), rgba(180,220,255,.05) 45%, rgba(250,252,255,.02))'
      : 'linear-gradient(180deg, rgba(8,13,34,.24), rgba(14,20,46,.13) 55%, rgba(18,26,56,.1))',
  })
  root.append(tint)

  const skyClear = wx.condition === 'clear' || wx.condition === 'partly-cloudy'
  if (!wx.isDay && skyClear) root.append(makeStars())
  if (skyClear) root.append(makeCelestial(wx))

  if (wx.condition === 'partly-cloudy') root.append(makeCloud(3, false))
  else if (wx.condition === 'cloudy') root.append(makeCloud(6, false))
  else if (wx.condition === 'thunderstorm') root.append(makeCloud(6, true))

  if (wx.condition === 'rain') root.append(makeRain(wx.intensity))
  else if (wx.condition === 'snow') root.append(makeSnow(wx.intensity))
  else if (wx.condition === 'thunderstorm') root.append(makeRain(Math.max(wx.intensity, 0.6)))

  if (wx.condition === 'fog') root.append(makeFog())
  if (wx.condition === 'thunderstorm') root.append(makeLightning())

  root.append(makeChip(wx))
  return root
}

// --- plugin -----------------------------------------------------------------

export const name = 'weather-sky-client'

export function apply(ctx: Context): void {
  const style = el('style')
  style.textContent = CSS
  document.head.append(style)

  let root = el('div', 'ws-sky')
  document.body.append(root)

  const timers: number[] = []
  let boltTimer: number | undefined
  let disposed = false

  async function refresh(): Promise<void> {
    try {
      const geo = await locate()
      if (!geo || disposed) return
      const wx = await fetchWeather(geo)
      if (disposed) return
      const next = render(wx)
      root.replaceWith(next)
      root = next
      scheduleBolt(wx.condition)
    } catch {
      // keep the previous frame on transient failure
    }
  }

  function scheduleBolt(condition: WeatherCondition): void {
    if (boltTimer !== undefined) clearInterval(boltTimer)
    boltTimer = undefined
    if (condition !== 'thunderstorm') return
    boltTimer = window.setInterval(() => {
      if (disposed) return
      const bolt = root.querySelector('.ws-bolt')
      const screen = root.querySelector('.ws-flash-screen')
      if (bolt && screen) {
        bolt.classList.remove('flash')
        screen.classList.remove('flash')
        void bolt.getBoundingClientRect()
        void screen.getBoundingClientRect()
        bolt.classList.add('flash')
        screen.classList.add('flash')
      }
    }, 6000)
  }

  void refresh()
  timers.push(window.setInterval(() => void refresh(), 15000))

  ctx.effect(() => () => {
    disposed = true
    for (const id of timers) clearInterval(id)
    if (boltTimer !== undefined) clearInterval(boltTimer)
    root.remove()
    style.remove()
  })
}
