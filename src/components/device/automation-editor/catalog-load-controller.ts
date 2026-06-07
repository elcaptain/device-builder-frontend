import type { ReactiveController, ReactiveControllerHost } from "lit";

import type { ESPHomeAPI } from "../../../api/index.js";
import type { AvailableAutomations } from "../../../api/types/automations.js";
import type { LocalizeFunc } from "../../../common/localize.js";
import {
  loadAndHydrateAvailable,
  resolveLoadedAvailable,
} from "./hydrate-available-bodies.js";

/**
 * Owns the concurrency guard for a trigger-less editor's catalog load
 * (script, api-action). The sequence token lives here, not on the
 * editor, so a load cannot be issued without it: load() is the only
 * entry point and always discards a result superseded by a later load
 * or by host disconnect, so an overlapping load can never clobber the
 * editor's state or double-fire the partial-hydration toast. The
 * editor just assigns the returned fields to its own reactive state.
 */
export class CatalogLoadController implements ReactiveController {
  private _seq = 0;

  constructor(host: ReactiveControllerHost) {
    host.addController(this);
  }

  /** A load resolving after the host detaches must not assign. */
  hostDisconnected(): void {
    this._seq++;
  }

  async load(
    api: ESPHomeAPI | undefined,
    configuration: string,
    localize: LocalizeFunc
  ): Promise<{ available?: AvailableAutomations; error?: string }> {
    if (!api || !configuration) return {};
    const seq = ++this._seq;
    // Trigger-less editors render actions + conditions only; skipping
    // trigger-body hydration avoids needless get_bodies work on mount.
    const outcome = await loadAndHydrateAvailable(api, configuration, {
      isStale: () => seq !== this._seq,
      lists: ["actions", "conditions"],
    });
    // Re-check after the await: a later load (or disconnect) bumped the
    // token, so this result is stale — drop it before it can toast or
    // assign.
    if (seq !== this._seq) return {};
    return resolveLoadedAvailable(outcome, localize);
  }
}
