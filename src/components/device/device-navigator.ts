import { consume } from "@lit/context";
import {
  mdiChevronDown,
  mdiChevronLeft,
  mdiChevronRight,
  mdiChevronUp,
  mdiCog,
  mdiHomeOutline,
  mdiPlusCircleOutline,
  mdiScriptTextOutline,
} from "@mdi/js";
import { html, LitElement } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import memoizeOne from "memoize-one";
import type { ESPHomeAPI } from "../../api/index.js";
import type { BoardCatalogEntry } from "../../api/types/boards.js";
import type { LocalizeFunc } from "../../common/localize.js";
import { apiContext, localizeContext } from "../../context/index.js";
import { espHomeStyles } from "../../styles/shared.js";
import { subscribeAutomationCatalogCache } from "../../util/automation-catalog-cache.js";
import {
  fetchComponent,
  getCachedComponent,
  subscribeComponentCache,
} from "../../util/component-name-cache.js";
import { registerMdiIcons } from "../../util/register-icons.js";
import {
  type YamlSection,
  categorizeSections,
  parseYamlAutomations,
  parseYamlTopLevelSections,
  sectionKeyOf,
} from "../../util/yaml-sections.js";
import type { HighlightRange } from "../yaml-editor.js";
import { CacheTickController } from "./cache-tick-controller.js";
import { deviceNavigatorStyles } from "./device-navigator.styles.js";
import { type NavigatorBuckets, deriveNavigatorBuckets } from "./navigator-buckets.js";
import { groupRowsByDomain } from "./navigator-groups.js";
import { type NavRow, resolveBucketLabels } from "./navigator-labels.js";
import { type NavAction, renderNavSection } from "./navigator-render.js";
import { NavigatorRevealController } from "./navigator-reveal-controller.js";

import "@home-assistant/webawesome/dist/components/icon/icon.js";
import "./add-automation-dialog.js";
import type { ESPHomeAddAutomationDialog } from "./add-automation-dialog.js";
import "./add-component-dialog.js";
import type { ESPHomeAddComponentDialog } from "./add-component-dialog.js";
import "./add-config-dialog.js";
import type { ESPHomeAddConfigDialog } from "./add-config-dialog.js";
import "./add-script-dialog.js";
import type { ESPHomeAddScriptDialog } from "./add-script-dialog.js";
import { SECTION_ICON } from "./section-icons.js";
import { TriggerCatalogController } from "./trigger-catalog-controller.js";

registerMdiIcons({
  "chevron-down": mdiChevronDown,
  "chevron-left": mdiChevronLeft,
  "chevron-up": mdiChevronUp,
  "chevron-right": mdiChevronRight,
  cog: mdiCog,
  "home-outline": mdiHomeOutline,
  "plus-circle-outline": mdiPlusCircleOutline,
  "script-text-outline": mdiScriptTextOutline,
});

@customElement("esphome-device-navigator")
export class ESPHomeDeviceNavigator extends LitElement {
  @consume({ context: localizeContext, subscribe: true })
  @state()
  private _localize: LocalizeFunc = (key) => key;

  @consume({ context: apiContext })
  private _api?: ESPHomeAPI;

  /**
   * Re-renders when the component-name or automation-trigger cache fills
   * in (so resolved labels appear); ``tick`` is the invalidation key for
   * ``_resolveLabels``.
   */
  private readonly _caches = new CacheTickController(this, [
    subscribeComponentCache,
    subscribeAutomationCatalogCache,
  ]);

  // Resolves automation rows' pretty trigger names; shared with the
  // component automations list in device-section-config.
  private readonly _triggerCatalog = new TriggerCatalogController(this, () => ({
    api: this._api,
    platform: this.platform || undefined,
    boardId: this.board?.id,
  }));

  private readonly _reveal = new NavigatorRevealController(this, () => ({
    selectedLine: this._selectedLine,
    buckets: this._deriveBuckets(this.yaml),
    openSections: this.openSections,
  }));

  @property({ attribute: false })
  openSections: Set<number> = new Set();

  @property({ attribute: false })
  yaml = "";

  /** Memoised on the YAML source so the parse pipeline runs once per
   *  edit, not per render. See {@link deriveNavigatorBuckets}. */
  private _deriveBuckets = memoizeOne(deriveNavigatorBuckets);

  /** Memoised on the rows identity so the Components regroup is stable
   *  across idle re-renders (selection/hover); collapse is render-time. */
  private _groupComponents = memoizeOne(groupRowsByDomain);

  /** Resolve every row's labels, indexed [core, components, automations]
   *  to match the section order. Memoised on the parsed buckets plus the
   *  inputs labels depend on (catalog ticks, platform, device name,
   *  locale). The trailing args exist solely to invalidate the memo. */
  private _resolveLabels = memoizeOne(
    (
      buckets: NavigatorBuckets,
      _tick: number,
      platform: string,
      deviceName: string,
      localize: LocalizeFunc
    ): NavRow[][] =>
      resolveBucketLabels(buckets, {
        triggerCatalog: this._triggerCatalog,
        platform,
        deviceName,
        localize,
        substitutions: buckets.substitutions,
      })
  );

  /** Optional board metadata; forwarded to the add-component dialog so
   * the embedded form can render GPIO pin selectors. */
  @property({ attribute: false })
  board: BoardCatalogEntry | null = null;

  @property()
  boardName = "";

  @property()
  configuration = "";

  /** Backend-resolved node name (esphome.name with substitutions
   *  expanded). Preferred over the raw YAML scalar for the esphome
   *  core section's subtitle so a `name: $devicename` doesn't leak
   *  the unexpanded `$devicename` into the navigator. */
  @property()
  deviceName = "";

  /** Device's target platform — forwarded to add-component / add-config
   * dialogs so the backend can resolve per-platform default values. */
  @property()
  platform = "";

  /** ``true`` once the parent's platform resolution settles.
   *  Without this gate the kickoff would routinely fire twice
   *  (yaml-edge with ``platform=""``, then platform-edge with the
   *  real value), landing in different ``BatchedCache`` buckets
   *  so the first round-trip is orphaned. */
  @property({ type: Boolean })
  platformReady = false;

  @query("esphome-add-config-dialog")
  private _addConfigDialog!: ESPHomeAddConfigDialog;

  @query("esphome-add-component-dialog")
  private _addComponentDialog!: ESPHomeAddComponentDialog;

  @query("esphome-add-automation-dialog")
  private _addAutomationDialog!: ESPHomeAddAutomationDialog;

  @query("esphome-add-script-dialog")
  private _addScriptDialog!: ESPHomeAddScriptDialog;

  @property({ attribute: false })
  selectedKey: string | null = null;

  @property({ attribute: false })
  selectedFromLine?: number;

  @state()
  private _selectedLine: number | null = null;

  @state()
  private _selectedRange: HighlightRange | null = null;

  @state()
  private _hoveredLine: number | null = null;

  /** Domains collapsed in the grouped Components list. */
  @state()
  private _collapsedGroups = new Set<string>();

  static styles = [espHomeStyles, deviceNavigatorStyles];

  protected willUpdate(changedProperties: Map<string, unknown>) {
    // Fire on the edge that satisfies the gate — typically just
    // the last of (yaml, platformReady) to land. A subsequent
    // ``platform`` change (post-mount reconnect, etc.) refires.
    if (
      (changedProperties.has("yaml") ||
        changedProperties.has("platform") ||
        changedProperties.has("platformReady")) &&
      this.yaml &&
      this.platformReady
    ) {
      this._kickoffNameResolves();
    }

    // Sync `_selectedLine`/`_selectedRange` whenever the externally-
    // controlled selection changes (URL restore, "go to component"
    // events from the dialog, YAML edits that shift line numbers).
    // We don't gate on `_selectedLine === null` here — that used to
    // be a guard against re-sync loops, but it also meant external
    // updates couldn't move the highlight off whatever was previously
    // selected.
    if (
      (changedProperties.has("selectedKey") ||
        changedProperties.has("yaml") ||
        changedProperties.has("selectedFromLine")) &&
      this.yaml
    ) {
      if (!this.selectedKey) {
        // Cleared externally — drop the local highlight.
        this._selectedLine = null;
        this._selectedRange = null;
        return;
      }
      const allSections = [
        ...parseYamlTopLevelSections(this.yaml),
        ...parseYamlAutomations(this.yaml),
      ];
      // Try fromLine first (exact match), fall back to key/platform
      // match (handles the case where the YAML shifted under us, e.g.
      // the user just added a component before the selected one).
      const match =
        (this.selectedFromLine !== undefined
          ? allSections.find((s) => s.fromLine === this.selectedFromLine)
          : undefined) ?? allSections.find((s) => sectionKeyOf(s) === this.selectedKey);
      if (match) {
        this._selectedLine = match.fromLine;
        this._selectedRange = {
          fromLine: match.fromLine,
          toLine: match.toLine,
        };
      }
    }
  }

  protected render() {
    const buckets = this._deriveBuckets(this.yaml);
    const { core, components, automations } = buckets;

    interface NavSection {
      label: string;
      desc: string;
      /** Leading section icon — mirrors the overview pane's step
       *  buttons (cog / chip / automation) so the two surfaces agree. */
      icon: string;
      items: YamlSection[];
      category: "core" | "component" | "automation";
      /** A section can carry multiple "+ Add X" affordances —
       *  Automations has both "+ Add automation" and "+ Add script",
       *  the others have one. */
      actions: NavAction[];
    }
    const sections: NavSection[] = [
      {
        label: this._localize("device.section_core"),
        desc: this._localize("device.section_core_desc"),
        icon: SECTION_ICON.core,
        items: core,
        category: "core",
        actions: [
          {
            label: this._localize("device.add_config"),
            icon: "cog",
            onClick: () => this._addConfigDialog.open(),
          },
        ],
      },
      {
        label: this._localize("device.section_components"),
        desc: this._localize("device.section_components_desc"),
        icon: SECTION_ICON.components,
        items: components,
        category: "component",
        actions: [
          {
            label: this._localize("device.add_component"),
            icon: SECTION_ICON.components,
            onClick: () => this._addComponentDialog.open(),
          },
        ],
      },
      {
        label: this._localize("device.section_automations"),
        desc: this._localize("device.section_automations_desc"),
        icon: SECTION_ICON.automations,
        items: automations,
        category: "automation",
        actions: [
          {
            label: this._localize("device.add_automation"),
            icon: SECTION_ICON.automations,
            onClick: () => this._addAutomationDialog.open(),
          },
          {
            label: this._localize("device.add_script"),
            icon: "script-text-outline",
            onClick: () => this._addScriptDialog.open(),
          },
        ],
      },
    ];

    // Labels resolve once per (yaml, catalog tick, platform, name, locale)
    // via the memo.
    const resolved = this._resolveLabels(
      buckets,
      this._caches.tick,
      this.platform,
      this.deviceName,
      this._localize
    );

    return html`
      <section class="card">
        <esphome-add-config-dialog
          .boardName=${this.boardName}
          .configuration=${this.configuration}
          .platform=${this.platform}
          .board=${this.board}
          .yaml=${this.yaml}
        ></esphome-add-config-dialog>
        <esphome-add-component-dialog
          .boardName=${this.boardName}
          .configuration=${this.configuration}
          .platform=${this.platform}
          .board=${this.board}
          .yaml=${this.yaml}
        ></esphome-add-component-dialog>
        <esphome-add-automation-dialog
          .boardName=${this.boardName}
          .configuration=${this.configuration}
          .board=${this.board}
          .yaml=${this.yaml}
          @automation-added=${this._onAutomationAdded}
        ></esphome-add-automation-dialog>
        <esphome-add-script-dialog
          .boardName=${this.boardName}
          .configuration=${this.configuration}
          .board=${this.board}
          .yaml=${this.yaml}
          @automation-added=${this._onAutomationAdded}
        ></esphome-add-script-dialog>
        <header class="card-header">
          <h2 class="card-title">
            <button
              type="button"
              class="card-title-btn"
              @click=${this._goToOverview}
              title=${this._localize("device.navigator_home")}
            >
              <wa-icon library="mdi" name="home-outline"></wa-icon>
              <span>${this._localize("device.navigator_title")}</span>
            </button>
          </h2>
          <button
            type="button"
            class="collapse-btn"
            @click=${this._onCollapseClick}
            title=${this._localize("device.hide_navigator")}
            aria-label=${this._localize("device.hide_navigator")}
          >
            <wa-icon library="mdi" name="chevron-left"></wa-icon>
          </button>
        </header>
        <div class="card-body">
          <p class="italic">${this._localize("device.navigator_desc")}</p>
          <div class="separator"></div>
          ${sections.map(({ label, desc, icon, category, actions }, i) => {
            const rows = resolved[i];
            return renderNavSection({
              label,
              desc,
              icon,
              actions,
              rows,
              // Components group by domain; other sections stay flat.
              groups: category === "component" ? this._groupComponents(rows) : undefined,
              collapsedGroups: this._collapsedGroups,
              onToggleGroup: (key) => this._toggleGroup(key),
              open: this.openSections.has(i),
              selectedLine: this._selectedLine,
              hoveredLine: this._hoveredLine,
              onToggle: () => this._toggleSection(i),
              onItemEnter: (item) =>
                this._onItemHover(item.fromLine, item.fromLine, item.toLine),
              onItemLeave: () => this._onItemLeave(),
              onItemClick: (item) => this._onItemClick(item),
            });
          })}
        </div>
      </section>
    `;
  }

  private _toggleSection(index: number) {
    this.dispatchEvent(
      new CustomEvent("section-toggle", {
        detail: { index },
        bubbles: true,
        composed: true,
      })
    );
  }

  /** Collapse/expand one domain subgroup (new Set so @state reacts). */
  private _toggleGroup(key: string) {
    const next = new Set(this._collapsedGroups);
    if (!next.delete(key)) next.add(key);
    this._collapsedGroups = next;
  }

  /** Clear the current section selection so the editor pane returns to
   *  the device overview (board image + "Change board"). Mirrors the
   *  deselect branch of ``_onItemClick`` without a row to toggle. */
  private _goToOverview = () => {
    this.selectedKey = null;
    this._selectedLine = null;
    this._selectedRange = null;
    this._hoveredLine = null;
    this._emitHighlight(null, false);
    this._emitSectionSelect(null, undefined);
  };

  /** Ask the page to hide the navigator. The page decides between
   *  desktop (set ``_navCollapsed`` + persist) and mobile (close the
   *  drawer) — we just say "I'd like to disappear". */
  private _onCollapseClick = () => {
    this.dispatchEvent(
      new CustomEvent("nav-collapse", {
        bubbles: true,
        composed: true,
      })
    );
  };

  /**
   * Fire-and-forget catalog lookups for any sections whose name we
   * haven't cached yet. Resolved entries land in the shared cache;
   * `_caches` re-renders the host when a fetch lands. Automations are
   * skipped — their keys are free-form strings (`<component> →
   * on_press`), not catalog ids.
   */
  private _kickoffNameResolves(): void {
    if (!this._api) return;
    const sections = parseYamlTopLevelSections(this.yaml);
    const { core, components } = categorizeSections(sections);
    const platform = this.platform || undefined;
    for (const item of [...core, ...components]) {
      const id = sectionKeyOf(item);
      if (getCachedComponent(id, platform) !== undefined) continue;
      void fetchComponent(this._api, id, platform).catch(() => {
        // Swallow — the navigator falls back to the raw id when no
        // catalog entry is available, so a transient backend hiccup
        // shouldn't surface as an error here.
      });
    }
    // Trigger catalog: lets automation entries render as
    // "Switch → On Turn On" instead of the raw YAML key. The
    // controller re-renders the host when the fetch lands.
    this._triggerCatalog.ensure();
  }

  private _onItemHover(line: number, fromLine: number, toLine: number) {
    this._hoveredLine = line;
    this._emitHighlight({ fromLine, toLine }, false);
  }

  private _onItemLeave() {
    this._hoveredLine = null;
    this._emitHighlight(this._selectedRange, false);
  }

  private _onItemClick(item: YamlSection) {
    const { fromLine, toLine } = item;
    const sectionKey = sectionKeyOf(item);

    if (this._selectedLine === fromLine) {
      this.selectedKey = null;
      this._selectedLine = null;
      this._selectedRange = null;
      this._emitHighlight(
        this._hoveredLine === fromLine ? { fromLine, toLine } : null,
        false
      );
      this._emitSectionSelect(null, undefined);
    } else {
      this.selectedKey = sectionKey;
      this._selectedLine = fromLine;
      this._selectedRange = { fromLine, toLine };
      this._emitHighlight({ fromLine, toLine }, true);
      this._emitSectionSelect(sectionKey, fromLine);
    }
  }

  private _emitHighlight(range: HighlightRange | null, scroll: boolean) {
    this.dispatchEvent(
      new CustomEvent("yaml-highlight", {
        detail: { range, scroll },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _emitSectionSelect(sectionKey: string | null, fromLine: number | undefined) {
    this.dispatchEvent(
      new CustomEvent("section-select", {
        detail: { sectionKey, fromLine },
        bubbles: true,
        composed: true,
      })
    );
  }

  /**
   * Bubble up from the add-automation / add-script wizards. After
   * a successful upsert we want the navigator to route to the new
   * section so the user lands in the inline edit pane to fill in
   * actions (and parameters, for scripts). The wizard emits with
   * a stable section key built via ``sectionKeyFromLocation`` —
   * the same key parseYamlAutomations will produce on the next
   * navigator render once the YAML refresh propagates.
   */
  private _onAutomationAdded = (e: CustomEvent<{ sectionKey: string }>) => {
    e.stopPropagation();
    this._emitSectionSelect(e.detail.sectionKey, undefined);
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-device-navigator": ESPHomeDeviceNavigator;
  }
}
