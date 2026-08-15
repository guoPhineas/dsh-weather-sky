/** Host loader entry for the browser-only weather overlay plugin. */

import type { Context } from '@deepseek-ai/cordis'

/**
 * Provides no host-side behavior: weather is fetched and rendered entirely in
 * the browser half (`src/client/index.ts`).
 */
export function apply(_ctx: Context): void {}
