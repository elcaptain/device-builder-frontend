import { html, nothing, type TemplateResult } from "lit";
import { withBase } from "../../util/base-path.js";
import type { YamlSection } from "../../util/yaml-sections.js";
import type { NavGroup } from "./navigator-groups.js";
import { type NavRow, prettyDomain } from "./navigator-labels.js";
import { iconForDomain } from "./navigator-row-icons.js";

/** A "+ Add X" affordance at the foot of a section. */
export interface NavAction {
  label: string;
  icon: string;
  onClick: () => void;
}

/** Everything one section block needs to render itself. */
export interface NavSectionView {
  label: string;
  icon: string;
  desc: string;
  actions: NavAction[];
  rows: NavRow[];
  open: boolean;
  selectedLine: number | null;
  hoveredLine: number | null;
  onToggle: () => void;
  onItemEnter: (item: YamlSection) => void;
  onItemLeave: () => void;
  onItemClick: (item: YamlSection) => void;
  /** When set, ``rows`` are rendered under collapsible domain subgroups
   *  instead of as a flat list. */
  groups?: NavGroup[];
  collapsedGroups?: Set<string>;
  onToggleGroup?: (key: string) => void;
}

/** Leading domain glyph for a flat row. The ``esphome`` core gets the brand
 *  logo instead of a generic chip (it would otherwise share ``esp32``'s chip);
 *  everything else uses its registered mdi glyph. The logo is the monochrome
 *  ``currentColor`` mark so it mutes to the same quiet tone as the other
 *  glyphs. The title is the hover tooltip, the glyph being the only domain cue
 *  on a flat row. */
function renderRowGlyph(domain: string): TemplateResult {
  if (domain === "esphome") {
    return html`<wa-icon
      class="nav-item-icon"
      src=${withBase("/assets/logo/esphome-mono.svg")}
      title="ESPHome"
    ></wa-icon>`;
  }
  return html`<wa-icon
    class="nav-item-icon"
    library="mdi"
    name=${iconForDomain(domain)}
    title=${prettyDomain(domain)}
  ></wa-icon>`;
}

/** One navigator row; shared by the filtered and unfiltered paths.
 *  ``showIcon`` adds a leading domain glyph for ungrouped rows (Core,
 *  Automations); grouped rows already carry the glyph on their subgroup
 *  header, so it's omitted there to avoid a redundant double-glyph. An
 *  automation row's ``parentKey`` is the component domain it targets, so
 *  it shows that component's glyph (binary_sensor, switch, …). */
function renderNavRow(row: NavRow, v: NavSectionView, showIcon: boolean): TemplateResult {
  const { item, labels } = row;
  const { primary, secondary } = labels;
  // The domain the glyph stands for (an automation row's is the component it
  // targets); also the icon's hover tooltip, since the glyph is the only
  // domain cue on a flat row.
  const domain = item.parentKey ?? item.key;
  return html`
    <div
      class="nav-item ${v.selectedLine === item.fromLine
        ? "nav-item--selected"
        : ""} ${v.hoveredLine === item.fromLine ? "nav-item--hovered" : ""}"
      @mouseenter=${() => v.onItemEnter(item)}
      @mouseleave=${() => v.onItemLeave()}
      @click=${() => v.onItemClick(item)}
    >
      ${showIcon ? renderRowGlyph(domain) : nothing}
      <div class="nav-item-content">
        <p>${primary}</p>
        ${secondary ? html`<span class="nav-item-subtitle">${secondary}</span>` : nothing}
      </div>
      <wa-icon class="nav-item-chevron" library="mdi" name="chevron-right"></wa-icon>
    </div>
  `;
}

/** One collapsible domain subgroup: header (name + count) then its rows. */
function renderNavGroup(group: NavGroup, v: NavSectionView): TemplateResult {
  const open = !v.collapsedGroups?.has(group.key);
  const toggle = () => v.onToggleGroup?.(group.key);
  const rowsId = `navgroup-${group.key}`;
  return html`
    <div
      class="nav-subgroup-header"
      role="button"
      tabindex="0"
      aria-expanded=${String(open)}
      aria-controls=${rowsId}
      @click=${toggle}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <wa-icon
        class="nav-subgroup-icon"
        library="mdi"
        name=${iconForDomain(group.key)}
      ></wa-icon>
      <span class="nav-subgroup-title">${prettyDomain(group.key)}</span>
      <span class="nav-subgroup-count">${group.rows.length}</span>
      <wa-icon
        class="nav-subgroup-chevron"
        library="mdi"
        name=${open ? "chevron-up" : "chevron-down"}
      ></wa-icon>
    </div>
    ${open
      ? html`<div id=${rowsId} class="nav-items nav-items--grouped">
          ${group.rows.map((row) => renderNavRow(row, v, false))}
        </div>`
      : nothing}
  `;
}

/** A single-of-a-kind domain: a collapsible header guarding one row is pure
 *  overhead, so render the row flat with its domain glyph (like an ungrouped
 *  Core row), in place of where the subgroup header would sit. */
function renderNavSingleGroup(group: NavGroup, v: NavSectionView): TemplateResult {
  return html`<div class="nav-items nav-items--single">
    ${renderNavRow(group.rows[0], v, true)}
  </div>`;
}

function renderNavAction(action: NavAction): TemplateResult {
  return html`<div class="action-item" @click=${() => action.onClick()}>
    <div>
      <wa-icon library="mdi" name=${action.icon}></wa-icon>
      <p>${action.label}</p>
    </div>
    <wa-icon library="mdi" name="plus-circle-outline"></wa-icon>
  </div>`;
}

/**
 * One section block: collapsible header, its rows, and the "+ Add X"
 * actions.
 */
export function renderNavSection(v: NavSectionView): TemplateResult {
  return html`
    <div class="nav-content" @click=${() => v.onToggle()}>
      <div class="nav-content-label">
        <wa-icon library="mdi" name=${v.icon}></wa-icon>
        <p>${v.label}</p>
      </div>
      <wa-icon
        class="nav-content-chevron"
        library="mdi"
        name=${v.open ? "chevron-up" : "chevron-down"}
      ></wa-icon>
    </div>
    ${v.open
      ? html`
          <div class="separator"></div>
          <p class="italic">${v.desc}</p>
          ${v.groups
            ? v.groups.map((group) =>
                // A single-of-a-kind domain collapses to a flat row in place
                // of a subgroup header guarding one item.
                group.rows.length === 1
                  ? renderNavSingleGroup(group, v)
                  : renderNavGroup(group, v)
              )
            : v.rows.length > 0
              ? html`<div class="nav-items">
                  ${v.rows.map((row) => renderNavRow(row, v, true))}
                </div>`
              : nothing}
          <div class="nav-items">
            ${v.actions.map((action) => renderNavAction(action))}
          </div>
        `
      : nothing}
    <div class="separator"></div>
  `;
}
