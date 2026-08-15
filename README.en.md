# dsh-weather-sky

[中文](./README.md)

A DeepSeek Harness (DSH) plugin that overlays a **live weather & sky animation** on the browser UI: sun by day, moon with real phases by night, plus clouds, rain (intensity-aware), snow, fog, and periodic lightning. It geolocates the user by IP, fetches live weather from Open-Meteo (no API key), and registers conversation tools to change the place, force a condition, or view a forecast.

---

## Features

| Capability | Description |
| --- | --- |
| IP geolocation | `ipwho.is` → `ipapi.co` (free, no key) |
| Live weather | Open-Meteo `current` (temperature, weather code, day/night, wind, cloud, precipitation) |
| Forecast | `weather_set_time` views a future moment (e.g. "tomorrow 14:00") |
| Day / night | sun by day, moon + stars by night |
| Moon phases | new → waxing crescent → first quarter → waxing gibbous → full → … → waning crescent |
| Celestial motion | sun arcs east→zenith→west by solar time; moon arcs by time + phase |
| Weather visuals | clouds, rain (scales with intensity), snow, fog, thunderstorm lightning (~6s) |
| Text-friendly | `pointer-events:none` overlay, low opacity, translucent status chip |
| Conversation tools | `weather_set_location`, `weather_set_condition`, `weather_set_time`, `weather_reset` |

---

## Weather-code mapping

| WMO | Condition | Visual |
| --- | --- | --- |
| 0 | clear | sun / moon |
| 1–2 | partly-cloudy | sun + a few clouds |
| 3 | cloudy | clouds, no sun/moon |
| 45/48 | fog | drifting fog |
| 51–57 | drizzle | light rain |
| 61/63/65 | light/moderate/heavy rain | rain scales with intensity |
| 71/73/75 | light/moderate/heavy snow | snow |
| 80–82 | showers → downpour | rain |
| 85/86 | snow showers | snow |
| 95–99 | thunderstorm | dark clouds + rain + lightning |

---

## Directory layout

```
src/
├── index.ts          # Host half: WeatherSkyService (TypertRemoteService + @Remote)
├── invariant.ts      # Invariant companion
├── types.ts          # Shared types (WeatherSnapshot, WeatherCondition, …)
└── client/index.ts   # Client half: shell.overlay animation layer
tsdown.config.ts      # Build (tsdown + typert generator)
package.json          # Manifest with dsh.client, exports, peerDeps
```

---

## Architecture

- **Host half** provides the `weatherSky` service with one remote method:
  `@Remote('getWeather')` → returns a `WeatherSnapshot` (lossless JSON).
- **Client half** consumes it through the generated Typert binding
  `ctx.remote.weatherSky.getWeather()`, polls every 15s, and renders the overlay
  into the `shell.overlay` slot.
- **Networking**: prefers `ctx.web.fetch`, falls back to `ctx.shell` running
  `curl` when no HTTP fetch provider is mounted.

---

## Building

```sh
pnpm install
pnpm build   # tsdown + typert generation
```

The Typert generator emits `lib/typert.host.js` and `lib/typert.remote-client.js`
for the `@Remote` method. It locates the workspace root by walking up to the
nearest `tsconfig.host.json`; for a standalone repo, place a `tsconfig.host.json`
(and `tsconfig.client.json`) at the root that mirrors the DSH base options.

---

## Installation

DSH composes plugins as rows in a `cordis.yml` / bundle patch. To wire this
package in and make it available to other users:

1. Place it in the DSH repo (or a fork) at `packages/extension/weather-sky`.
2. Add a row to the target bundle's patch, e.g.
   `packages/bundle/web-app/cordis.patch.yml`:
   ```yaml
   - id: weather-sky
     name: '@deepseek-ai/dsh-weather-sky'
   ```
3. Add the `"workspace:^"` dependency to that bundle's `package.json`.
4. Rebuild and restart DSH; every session on that profile gets the overlay and
   the four conversation tools.

> Note: DSH plugins currently follow the monorepo convention (`workspace:^`
> deps + Typert codegen tied to the workspace root), so they are distributed
> with the deployment rather than installed standalone via `npm install`.

---

## Conversation tools

| Tool | Purpose | Example |
| --- | --- | --- |
| `weather_set_location` | Set the displayed place (geocoded) | "set weather to Beijing" |
| `weather_set_condition` | Force a weather visual | "show thunder", "snow" |
| `weather_set_time` | Set a target time (now or future) | "show tomorrow 14:00" |
| `weather_reset` | Restore auto (IP + current time) | "restore auto weather" |

---

## License

[MIT](./LICENSE)
