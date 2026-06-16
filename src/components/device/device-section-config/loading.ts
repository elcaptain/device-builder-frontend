import type { ConfigEntry, RequiredGroup } from "../../../api/types/config-entries.js";
import { fetchComponent } from "../../../util/component-name-cache.js";
import { normalizeHexValues } from "../../../util/hex-int.js";
import { loadCatalog } from "../../../util/yaml-completion-catalog.js";
import { parseYamlSectionValues } from "../../../util/yaml-section-reader.js";
import { resolveCurrentFromLine } from "../../../util/yaml-sections.js";
import { parseTopLevelComponents } from "../../../util/yaml-serialize.js";
import type { ESPHomeDeviceSectionConfig } from "../device-section-config.js";
import { YAML_ONLY_SECTIONS } from "../yaml-only-sections.js";

export interface SectionConfigResponse {
  section_key: string;
  section_type: "core" | "component" | "automation";
  title: string;
  description: string;
  docs_url: string;
  icon: string;
  image_url: string;
  entries: ConfigEntry[];
  required_groups: RequiredGroup[];
}

export async function loadConfig(host: ESPHomeDeviceSectionConfig): Promise<void> {
  const id = ++host._loadId;
  host._loading = true;
  host._error = "";
  host._config = null;
  host._isUnknown = false;
  host._setDirty(false);
  if (host._draftTimer) {
    clearTimeout(host._draftTimer);
    host._draftTimer = null;
  }
  host._lastSelfWrittenYaml = null;

  try {
    const platform = host.board?.esphome.platform;
    // YAML-only sections (recursive/complex shapes like lvgl) render no form,
    // so source the header from the slim catalog index and never fetch the
    // full per-id body — lvgl's is ~14 MB. Other sections hydrate the body
    // through the session-scoped cache so a re-load per keystroke
    // (editor/validate_yaml's post-render refresh) doesn't re-issue the round
    // trip.
    const yamlOnly = YAML_ONLY_SECTIONS.has(host.sectionKey);
    // loadCatalog degrades to an empty index (logged) rather than rejecting, so
    // a genuine load failure surfaces as a raw-id YAML-only header, not a throw;
    // a real throw still reaches loadConfig's catch below.
    const component = yamlOnly
      ? ((await loadCatalog(host._api)).byId.get(host.sectionKey) ?? null)
      : await fetchComponent(host._api, host.sectionKey, platform);

    if (id !== host._loadId) return;

    // Use the live YAML the parent passes in — fromLine is relative to it.
    // A _api.getConfig re-fetch would disagree with what the editor pane
    // shows when there are unsaved edits and seed the form from a
    // different section than the user clicked.
    const yaml = host.yaml;

    if (!component) {
      // External component — synthesise a config with no entries
      // so the YAML-only notice fires. Store sectionKey as title (not a
      // localised "External component" label) so the delete confirm + toast
      // read distinctly when a device has multiple unknown sections.
      host._config = {
        section_key: host.sectionKey,
        section_type: "core",
        title: host.sectionKey,
        description: "",
        docs_url: "",
        icon: "",
        image_url: "",
        entries: [],
        required_groups: [],
      };
      host._isUnknown = true;
    } else {
      host._config = {
        section_key: host.sectionKey,
        section_type: "core",
        title: component.name,
        description: component.description,
        docs_url: component.docs_url,
        icon: "",
        image_url: component.image_url,
        // YAML-only sections drop entries so the "edit in YAML" notice fires;
        // the slim index carries no config_entries to render anyway.
        entries: yamlOnly ? [] : component.config_entries,
        required_groups: yamlOnly ? [] : (component.required_groups ?? []),
      };
    }
    // Asymmetric with save/delete paths: undefined here means "section
    // not in live yaml" — surface an empty form (silent), since this load
    // is reactive to external mutations, not explicit user intent.
    const resolvedFromLine = resolveCurrentFromLine(yaml, host.sectionKey, host.fromLine);
    const parsedValues = parseYamlSectionValues(yaml, host.sectionKey, resolvedFromLine);
    // Pre-format hex values to canonical "0x…" string form (#410) so a
    // save preserves the user's hex notation even when they only edited
    // an unrelated field. Without this, i2c addresses round-trip from
    // 0x76 to 118 on the next save.
    host._values = normalizeHexValues(parsedValues, host._config.entries);
    host._resolvedFromLine = resolvedFromLine;
    host._presentComponents = parseTopLevelComponents(yaml);
  } catch (e) {
    if (id !== host._loadId) return;
    const msg = e instanceof Error ? e.message : "";
    host._error = msg.includes("timed out")
      ? host._localize("device.load_config_error")
      : msg || host._localize("device.load_config_error");
  } finally {
    if (id === host._loadId) {
      host._loading = false;
    }
  }
}
