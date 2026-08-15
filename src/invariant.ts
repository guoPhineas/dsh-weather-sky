/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-weather-sky`.
 * @module @deepseek-ai/dsh-weather-sky/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-weather-sky'

/** Cordis companion plugin name. */
export const name = 'weather-sky-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the weather snapshot is derived read-only from
 * Open-Meteo (or a manual override) and published through the Typert remote;
 * there is no durable store to keep consistent.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
