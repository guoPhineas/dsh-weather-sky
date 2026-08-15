# dsh-weather-sky

[中文](./README.md)

A DeepSeek Harness (DSH) Web GUI plugin that overlays a **live weather & sky animation**: sun by day, moon with real phases by night, plus clouds, rain (intensity-aware), snow, fog, and periodic lightning.

Weather is fetched **in the browser** from Open-Meteo (no API key), with location resolved via `navigator.geolocation` (falling back to `ipwho.is`).

---

## Features

| Capability | Description |
| --- | --- |
| Geolocation | Browser geolocation first, IP geolocation (`ipwho.is`) fallback |
| Live weather | Open-Meteo (no key): temperature, weather code, day/night, cloud, precipitation |
| Day / night | sun by day, moon + stars by night |
| Moon phases | new → waxing crescent → first quarter → waxing gibbous → full → … → waning crescent |
| Celestial motion | sun arcs east→zenith→west by solar time; moon arcs by time + phase |
| Weather visuals | clouds, rain (scales with intensity), snow, fog, thunderstorm lightning (~6s) |
| Text-friendly | `pointer-events:none` overlay, low opacity, translucent status chip |

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

## Installation

### Quick start

Tell your dsh:

```
Install this weather plugin: https://github.com/guoPhineas/dsh-weather-sky
```

### CLI

```sh
git clone https://github.com/guoPhineas/dsh-weather-sky
cd <harness>
dsh plugin --profile web add ../dsh-weather-sky
```

---

## Directory layout

```
src/
├── index.ts            # Host half (empty apply; browser-only plugin)
└── client/index.ts     # Client half: weather fetch + DOM/CSS animation layer
cordis.patch.yml        # bundle patch (inserts this package's dsh.client entry)
tsdown.config.ts        # build (tsdown)
package.json            # manifest: dsh.bundle.patch, dsh.client, peerDeps
```

---

## Building

```sh
pnpm install
pnpm build   # tsdown
```

Output goes to `lib/` (`index.js` host entry, `client.js` browser half).

---

## Notes

- This is a **client-primary** plugin: weather is fetched and rendered in the browser; the host half registers no model tools.
- DSH external plugins depend on the published `@deepseek-ai/cordis` (`^4.0.1`) and are installed via `dsh plugin --profile <name> add <path>`, without modifying DSH source.
- On a transient weather/geolocation failure, the overlay keeps the previous frame and retries on the next cycle (15s).

---

## License

[MIT](./LICENSE)
