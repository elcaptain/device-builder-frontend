import type { ESPHomeAPI } from "../api/index.js";
import type { BoardCatalogEntry } from "../api/types.js";
import { BatchedCache } from "./batched-cache.js";

/** Session-scoped cache of full board bodies, keyed by board id.
 *  The list endpoint (`boards/get_boards`) ships slim
 *  `BoardCatalogIndex` entries; detail / wizard / install flows
 *  hydrate a body through here when they need pins, hardware,
 *  featured components, or default components. Cross-board fetches
 *  in the same microtask coalesce into one `boards/get_bodies`
 *  round trip — same shape as `automation-body-cache.ts`. */

const _cache = new BatchedCache<BoardCatalogEntry, void>({
  name: "board-body-cache",
  bucketKey: () => "",
  // The slim index advertises every board id the dashboard will
  // ask for; a missing body is a backend contract violation, not a
  // permanent catalog miss. Don't cache the null so a re-mount can
  // recover.
  cacheMisses: false,
  fetch: (api, keys) => api.getBoardBodies(keys),
});

/** Synchronous cache read. ``cacheMisses: false`` means we never
 *  persist a null body, so the return is just
 *  ``BoardCatalogEntry | undefined``. */
export function getCachedBoardBody(id: string): BoardCatalogEntry | undefined {
  return _cache.getCached(id, undefined) ?? undefined;
}

export function fetchBoardBody(
  api: ESPHomeAPI,
  id: string
): Promise<BoardCatalogEntry | null> {
  return _cache.fetch(api, id, undefined);
}

export function subscribeBoardBodyCache(listener: () => void): () => void {
  return _cache.subscribe(listener);
}

export function _clearBoardBodyCache(): void {
  _cache.clear();
}
