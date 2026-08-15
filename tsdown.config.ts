import { defineConfig } from 'tsdown'
import { typertPlugin } from '@deepseek-ai/dsh-typert-generator/tsdown'

/**
 * Build the Host node bundle. The Typert generator runs at writeBundle time and
 * emits `lib/typert.host.js` and `lib/typert.remote-client.js` for the
 * `@Remote('getWeather')` method, which the browser half consumes through
 * `ctx.remote.weatherSky`.
 *
 * NOTE: the Typert generator locates the workspace root by walking up to the
 * nearest `tsconfig.host.json`, mirroring the DeepSeek Harness monorepo build.
 * For a standalone package, place a `tsconfig.host.json` (and
 * `tsconfig.client.json`) at the repo root that extends the same base options.
 */
export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: true,
    clean: true,
    plugins: [typertPlugin({ mode: 'package' })],
  },
  {
    entry: ['src/invariant.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: true,
    clean: false,
  },
])
