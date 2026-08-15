/**
 * Wire vocabulary shared by the Host and Client halves of the weather-sky
 * plugin. Both planes import only TYPES from this module so nothing runtime
 * crosses the client-bundle purity gate.
 */

/** Normalized weather condition keys the Client overlay renders. */
export type WeatherCondition =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'rain'
  | 'snow'
  | 'thunderstorm'

/** The lossless-JSON payload the Client overlay consumes. */
export interface WeatherSnapshot {
  ok: true
  /** Human-readable place name, e.g. "Jinan". */
  location: string
  condition: WeatherCondition
  /** 0..1 visual intensity (rain/snow density, storm strength). */
  intensity: number
  /** Human-readable condition label, e.g. "小雨". */
  label: string
  /** Whether the sun should be shown (daytime + clear-ish sky). */
  isDay: boolean
  /** Celsius, rounded; null when unknown (manual condition). */
  tempC: number | null
  /** km/h, rounded; null when unknown. */
  windKmh: number | null
  /** 0..1 moon phase fraction (0 = new moon). */
  moonPhase: number
  /** Chinese moon-phase name. */
  moonLabel: string
  /** 0..1 sun position along its east→west arc. */
  sunArc: number
  /** 0..1 moon position along its east→west arc. */
  moonArc: number
  /** Optional target-time label ("明天 14:00") when viewing a forecast. */
  targetLabel: string | null
  /** Optional forecast/fallback error text, surfaced on hover. */
  error: string | null
}

/** Manual condition keys accepted by the set-condition model tool. */
export type ManualCondition =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'heavy-rain'
  | 'snow'
  | 'thunderstorm'
