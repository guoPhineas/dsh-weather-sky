/**
 * Weather & Sky — Host half.
 *
 * Provides the `weatherSky` service (a TypertRemoteService) that resolves the
 * current/forecast weather for one place, and registers four model-facing
 * tools (`weather_set_location`, `weather_set_condition`, `weather_set_time`,
 * `weather_reset`) so the user can drive the overlay from conversation.
 *
 * Network strategy mirrors the original dynamic plugin:
 *   1. prefer `ctx.web.fetch` (the proper web-fetch capability);
 *   2. on any failure / unavailable provider, fall back to `ctx.shell` running
 *      `curl -sS --max-time 10` (works even when no `web-fetch-http` provider
 *      is mounted, as long as the host can reach the internet and has curl).
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { WeatherSnapshot, ManualCondition } from './types.ts'

export type * from './types.ts'

const GEO_RETRY_MS = 5 * 60 * 1000
const WEATHER_CACHE_MS = 10 * 60 * 1000

/** Cordis service key the client half consumes through `ctx.remote`. */
export const WEATHER_SKY_SERVICE = 'weatherSky'

/** Internal mutable owner state, scoped to one service instance. */
interface WeatherSkyState {
  locationOverride: { name: string; latitude: number; longitude: number } | null
  conditionOverride: { condition: string; intensity: number } | null
  resolvedGeo: { name: string; latitude: number; longitude: number; country?: string; admin1?: string } | null
  geoLastTried: number
  weatherCache: { data: WeatherSnapshot; at: number } | null
  targetTime: number | null
  targetLabel: string | null
}

/** A resolved geo point. */
interface GeoPoint {
  name: string
  latitude: number
  longitude: number
  country?: string
  admin1?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    weatherSky: WeatherSkyService
  }
}

export class WeatherSkyService extends TypertRemoteService {
  // `tools` is a hard dependency (always present); `web` and `shell` are
  // optional capabilities resolved lazily so the plugin still activates on
  // deployments without an HTTP fetch provider or a shell (it degrades to a
  // clear fallback snapshot).
  static inject = ['tools']

  private readonly state: WeatherSkyState = {
    locationOverride: null,
    conditionOverride: null,
    resolvedGeo: null,
    geoLastTried: 0,
    weatherCache: null,
    targetTime: null,
    targetLabel: null,
  }

  constructor(ctx: Context) {
    super(ctx, WEATHER_SKY_SERVICE)
  }

  protected async [Service.init](): Promise<void> {
    this.registerTools()
  }

  // -- tool registration ----------------------------------------------------

  private registerTools(): void {
    const tools = this.ctx.get('tools')
    if (tools === undefined) return
    this.ctx.effect(() => tools.register(defineTool({
      name: 'weather_set_location',
      description: 'Set the place the weather overlay shows. Call when the user asks to change the city (e.g. "set weather to Beijing"); geocodes the place and the UI then shows its live weather.',
      parameters: {
        location: { type: 'string', required: true, description: 'City or place name, e.g. "Beijing", "Shanghai", "New York", "Tokyo"' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{
          type: 'text',
          text: (value as { ok: boolean; name?: string; latitude?: number; longitude?: number; error?: string }).ok
            ? `Weather place set to ${(value as { name: string }).name}.`
            : `Failed to set place: ${(value as { error: string }).error}`,
        }],
      },
      execute: async (args) => {
        const location = String((args as { location?: unknown }).location ?? '').trim()
        try {
          const g = await this.geocode(location)
          this.state.locationOverride = { name: g.name, latitude: g.latitude, longitude: g.longitude }
          this.state.resolvedGeo = null
          this.state.geoLastTried = 0
          this.state.weatherCache = null
          return { ok: true, name: g.name, latitude: g.latitude, longitude: g.longitude }
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) }
        }
      },
    })), 'weather-sky: tool set-location')

    this.ctx.effect(() => tools.register(defineTool({
      name: 'weather_set_condition',
      description: 'Force a weather visual effect (for demos, or when live weather is unavailable). e.g. show thunder, heavy rain, snow.',
      parameters: {
        condition: {
          type: 'string',
          required: true,
          enum: ['clear', 'partly-cloudy', 'cloudy', 'fog', 'drizzle', 'rain', 'heavy-rain', 'snow', 'thunderstorm'],
          description: 'Weather type',
        },
        intensity: { type: 'number', description: '0..1 (optional); closer to 1 for heavier rain/snow' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: (value as { ok: boolean; label?: string; error?: string }).ok
          ? `Weather effect set to "${(value as { label: string }).label}".`
          : `Failed to set condition: ${(value as { error: string }).error}` }],
      },
      execute: async (args) => {
        const raw = String((args as { condition?: unknown }).condition ?? 'clear') as ManualCondition
        const mapped = CONDITION_MAP[raw] ?? CONDITION_MAP.clear
        const requested = (args as { intensity?: unknown }).intensity
        const intensity = typeof requested === 'number'
          ? Math.max(0, Math.min(1, requested))
          : mapped.intensity
        this.state.conditionOverride = { condition: mapped.condition, intensity }
        this.state.weatherCache = null
        return { ok: true, condition: mapped.condition, label: labelFor(mapped.condition, intensity) }
      },
    })), 'weather-sky: tool set-condition')

    this.ctx.effect(() => tools.register(defineTool({
      name: 'weather_set_time',
      description: 'Set the target time the overlay shows. Defaults to now; can show a future moment (e.g. "tomorrow 14:00") via hourly forecast.',
      parameters: {
        when: { type: 'string', required: true, description: '"now", or an ISO 8601 string like "2026-08-16T14:00:00+08:00"' },
        label: { type: 'string', description: 'Optional display label, e.g. "tomorrow 14:00"' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{
          type: 'text',
          text: (value as { ok: boolean; mode?: string; label?: string; error?: string }).ok
            ? ((value as { mode: string }).mode === 'now' ? 'Switched to current weather.' : `Weather time set to "${(value as { label: string }).label}".`)
            : `Failed to set time: ${(value as { error: string }).error}`,
        }],
      },
      execute: async (args) => {
        const when = String((args as { when?: unknown }).when ?? '').trim()
        if (when === '' || when === 'now') {
          this.state.targetTime = null
          this.state.targetLabel = null
          this.state.weatherCache = null
          return { ok: true, mode: 'now' }
        }
        const ms = Date.parse(when)
        if (!Number.isFinite(ms)) return { ok: false, error: `Cannot parse time: ${when}` }
        this.state.targetTime = ms
        this.state.targetLabel = (args as { label?: unknown }).label as string ?? when
        this.state.weatherCache = null
        return { ok: true, mode: 'target', time: new Date(ms).toISOString(), label: this.state.targetLabel }
      },
    })), 'weather-sky: tool set-time')

    this.ctx.effect(() => tools.register(defineTool({
      name: 'weather_reset',
      description: 'Clear manual place, condition and target time; restore IP-based auto weather at the current time.',
      parameters: {},
      output: {
        schema: { type: 'json' },
        render: () => [{ type: 'text', text: 'Restored auto weather (IP-based, current time).' }],
      },
      execute: async () => {
        this.state.locationOverride = null
        this.state.conditionOverride = null
        this.state.resolvedGeo = null
        this.state.geoLastTried = 0
        this.state.weatherCache = null
        this.state.targetTime = null
        this.state.targetLabel = null
        return { ok: true }
      },
    })), 'weather-sky: tool reset')
  }

  // -- remote API -----------------------------------------------------------

  /**
   * Resolve the weather snapshot the Client overlay renders. Remote-callable
   * from the browser through the generated Typert Gateway interface.
   */
  @Remote('getWeather')
  async getWeather(): Promise<WeatherSnapshot> {
    return this.resolveWeather()
  }

  // -- networking -----------------------------------------------------------

  private async fetchJson(url: string): Promise<unknown> {
    const web = this.ctx.get('web')
    if (web !== undefined) {
      try {
        const res = await web.fetch({ url })
        if (res && res.statusCode >= 200 && res.statusCode < 300) {
          const body = res.body && res.body.content ? res.body.content : ''
          return JSON.parse(body)
        }
      } catch {
        // fall through to curl
      }
    }
    return this.curlJson(url)
  }

  private async curlJson(url: string): Promise<unknown> {
    const shell = this.ctx.get('shell')
    if (shell === undefined) throw new Error('shell service unavailable')
    const spec = shell.resolve({
      command: `curl -sS --max-time 10 '${url}'`,
      timeoutMs: 12000,
      stdoutMaxBytes: 200000,
    })
    const result = await shell.run(spec)
    if (result.exitCode !== 0) throw new Error(`curl exit ${result.exitCode}`)
    const text = result.stdout && result.stdout.text ? result.stdout.text : ''
    return JSON.parse(text)
  }

  // -- geolocation ----------------------------------------------------------

  private async geocode(name: string): Promise<GeoPoint> {
    const url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(name) + '&count=1&language=zh&format=json'
    const data = await this.fetchJson(url) as { results?: Array<{ name?: string; latitude?: number; longitude?: number; country?: string; admin1?: string }> }
    const r = data?.results?.[0]
    if (!r || r.latitude == null || r.longitude == null) throw new Error(`Place not found: ${name}`)
    return { name: r.name ?? name, latitude: r.latitude, longitude: r.longitude, country: r.country, admin1: r.admin1 }
  }

  private async geoByIp(): Promise<GeoPoint | null> {
    const providers = ['https://ipwho.is/', 'https://ipapi.co/json/']
    for (const url of providers) {
      try {
        const data = await this.fetchJson(url) as Record<string, unknown>
        if (url.includes('ipwho')) {
          if (data && data.success !== false && data.latitude != null && data.longitude != null) {
            return { name: (data.city as string) || (data.region as string) || 'Current', latitude: data.latitude as number, longitude: data.longitude as number, country: data.country as string }
          }
        } else if (data && data.latitude != null && data.longitude != null && !data.error) {
          return { name: (data.city as string) || 'Current', latitude: data.latitude as number, longitude: data.longitude as number, country: data.country_name as string }
        }
      } catch {
        // try next provider
      }
    }
    return null
  }

  private async resolveGeo(): Promise<GeoPoint | null> {
    if (this.state.locationOverride) {
      this.state.resolvedGeo = this.state.locationOverride
      return this.state.resolvedGeo
    }
    if (this.state.resolvedGeo) return this.state.resolvedGeo
    const now = Date.now()
    if (this.state.geoLastTried && now - this.state.geoLastTried < GEO_RETRY_MS) return null
    this.state.geoLastTried = now
    const geo = await this.geoByIp()
    this.state.resolvedGeo = geo
    return geo
  }

  // -- weather resolution ---------------------------------------------------

  private geoName(geo: GeoPoint | null): string {
    if (!geo) return '未知位置'
    const parts = [geo.name, geo.admin1, geo.country].filter(Boolean)
    return parts.slice(0, 2).join(' · ')
  }

  private async resolveWeather(): Promise<WeatherSnapshot> {
    const now = new Date()
    const isForecast = this.state.targetTime != null
    const targetDate = isForecast ? new Date(this.state.targetTime!) : now

    if (this.state.conditionOverride) {
      const geo = await this.resolveGeo()
      const isDay = geo ? isDaytime(geo.latitude, geo.longitude, targetDate) : (targetDate.getHours() >= 6 && targetDate.getHours() < 19)
      return this.buildWeather({
        condition: this.state.conditionOverride.condition,
        intensity: this.state.conditionOverride.intensity,
        isDay, tempC: null, windKmh: null, source: 'manual',
        location: this.geoName(geo),
        latitude: geo?.latitude ?? null,
        longitude: geo?.longitude ?? null,
      }, targetDate)
    }

    const geo = await this.resolveGeo()
    if (geo === null) {
      return this.buildWeather({
        condition: 'clear', intensity: 0,
        isDay: targetDate.getHours() >= 6 && targetDate.getHours() < 19,
        tempC: null, windKmh: null, source: 'fallback',
        location: '自动定位中…', error: '无法通过 IP 定位（网络不可用）',
      }, targetDate)
    }

    if (this.state.weatherCache && now.getTime() - this.state.weatherCache.at < WEATHER_CACHE_MS) {
      return this.state.weatherCache.data
    }

    if (isForecast) {
      try {
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + geo.latitude + '&longitude=' + geo.longitude
          + '&hourly=weather_code,temperature_2m,is_day,precipitation,cloud_cover,wind_speed_10m&forecast_days=3&timezone=auto'
        const data = await this.fetchJson(url) as { hourly?: HourlyForecast }
        const hourly = data?.hourly
        if (!hourly || !hourly.time || hourly.time.length === 0) throw new Error('no hourly forecast')
        let idx = 0
        const targetMs = this.state.targetTime!
        for (let i = 0; i < hourly.time.length; i++) {
          if (Date.parse(hourly.time[i]) <= targetMs) idx = i
          else break
        }
        const c = conditionFromCode(hourly.weather_code[idx])
        const out = this.buildWeather({
          condition: c.condition, intensity: c.intensity,
          isDay: hourly.is_day[idx] === 1,
          tempC: hourly.temperature_2m[idx],
          windKmh: hourly.wind_speed_10m[idx],
          cloudCover: hourly.cloud_cover?.[idx] ?? null,
          precipitation: hourly.precipitation?.[idx] ?? null,
          source: 'open-meteo-forecast',
          location: this.geoName(geo),
          latitude: geo.latitude, longitude: geo.longitude,
        }, targetDate)
        this.state.weatherCache = { data: out, at: now.getTime() }
        return out
      } catch (e) {
        if (this.state.weatherCache) return this.state.weatherCache.data
        return this.buildWeather({
          condition: 'clear', intensity: 0,
          isDay: isDaytime(geo.latitude, geo.longitude, targetDate),
          tempC: null, windKmh: null, source: 'fallback',
          location: this.geoName(geo), latitude: geo.latitude, longitude: geo.longitude,
          error: e instanceof Error ? e.message : String(e),
        }, targetDate)
      }
    }

    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + geo.latitude + '&longitude=' + geo.longitude
        + '&current=weather_code,temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,cloud_cover,wind_speed_10m&timezone=auto'
      const data = await this.fetchJson(url) as { current?: CurrentWeather }
      const cur = data?.current
      if (!cur) throw new Error('empty weather data')
      const c = conditionFromCode(cur.weather_code)
      const out = this.buildWeather({
        condition: c.condition, intensity: c.intensity,
        isDay: cur.is_day === 1,
        tempC: cur.temperature_2m,
        windKmh: cur.wind_speed_10m,
        cloudCover: cur.cloud_cover ?? null,
        precipitation: cur.precipitation ?? null,
        source: 'open-meteo', location: this.geoName(geo),
        latitude: geo.latitude, longitude: geo.longitude,
      }, now)
      this.state.weatherCache = { data: out, at: now.getTime() }
      return out
    } catch (e) {
      if (this.state.weatherCache) return this.state.weatherCache.data
      return this.buildWeather({
        condition: 'clear', intensity: 0,
        isDay: isDaytime(geo.latitude, geo.longitude, now),
        tempC: null, windKmh: null, source: 'fallback',
        location: this.geoName(geo), latitude: geo.latitude, longitude: geo.longitude,
        error: e instanceof Error ? e.message : String(e),
      }, now)
    }
  }

  private buildWeather(o: {
    condition: string; intensity: number; isDay: boolean; tempC: number | null; windKmh: number | null
    source: string; location: string; latitude?: number | null; longitude?: number | null
    cloudCover?: number | null; precipitation?: number | null; error?: string | null
  }, date: Date): WeatherSnapshot {
    const moonF = moonPhaseFraction(date)
    let sunArc = 0.5
    let moonArc = 0.5
    if (o.latitude != null && o.longitude != null) {
      const arcs = computeArcs(o.latitude, o.longitude, date, moonF)
      sunArc = arcs.sunArc
      moonArc = arcs.moonArc
    }
    return {
      ok: true,
      location: o.location,
      condition: o.condition as WeatherSnapshot['condition'],
      intensity: Math.round(o.intensity * 100) / 100,
      label: labelFor(o.condition, o.intensity),
      isDay: o.isDay,
      tempC: o.tempC == null ? null : Math.round(o.tempC),
      windKmh: o.windKmh == null ? null : Math.round(o.windKmh),
      moonPhase: Math.round(moonF * 100) / 100,
      moonLabel: moonLabel(moonF),
      sunArc: Math.round(sunArc * 1000) / 1000,
      moonArc: Math.round(moonArc * 1000) / 1000,
      targetLabel: this.state.targetLabel,
      error: o.error ?? null,
    }
  }
}

// -- module-level helpers (pure) --------------------------------------------

interface HourlyForecast {
  time: string[]
  weather_code: number[]
  temperature_2m: number[]
  is_day: number[]
  precipitation?: number[]
  cloud_cover?: number[]
  wind_speed_10m: number[]
}

interface CurrentWeather {
  weather_code: number
  temperature_2m: number
  is_day: number
  precipitation?: number
  cloud_cover?: number
  wind_speed_10m: number
}

const CONDITION_MAP: Record<ManualCondition, { condition: string; intensity: number }> = {
  clear: { condition: 'clear', intensity: 0 },
  'partly-cloudy': { condition: 'partly-cloudy', intensity: 0 },
  cloudy: { condition: 'cloudy', intensity: 0 },
  fog: { condition: 'fog', intensity: 0 },
  drizzle: { condition: 'rain', intensity: 0.25 },
  rain: { condition: 'rain', intensity: 0.55 },
  'heavy-rain': { condition: 'rain', intensity: 0.9 },
  snow: { condition: 'snow', intensity: 0.6 },
  thunderstorm: { condition: 'thunderstorm', intensity: 0.8 },
}

function conditionFromCode(code: number): { condition: string; intensity: number } {
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

function labelFor(condition: string, intensity: number): string {
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
  const m: Record<string, string> = { clear: '晴', 'partly-cloudy': '局部多云', cloudy: '阴', fog: '雾', thunderstorm: '雷阵雨' }
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

export default WeatherSkyService
