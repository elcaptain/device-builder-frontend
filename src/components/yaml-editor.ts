import { consume } from "@lit/context";
import { lintGutter } from "@codemirror/lint";
import { StateEffect, StateField } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { Decoration, type DecorationSet } from "@codemirror/view";
import { LitElement, css, html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { basicSetup, EditorView } from "codemirror";
import { EditorState } from "@codemirror/state";
import type { ESPHomeAPI } from "../api/index.js";
import { apiContext, darkModeContext } from "../context/index.js";
import { esphomeYaml } from "../util/esphome-yaml-lang.js";
import type { YamlSection } from "../util/yaml-sections.js";
import { createYamlCompletion } from "../util/yaml-completion.js";
import { yamlLinter } from "../util/yaml-lint.js";
import { createBackendYamlLinter } from "../util/yaml-lint-backend.js";

export type HighlightRange = Pick<YamlSection, "fromLine" | "toLine">;

// Module-level singletons so they survive editor rebuilds
const setHighlight = StateEffect.define<HighlightRange | null>();

const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setHighlight)) {
        if (!effect.value) return Decoration.none;
        const { fromLine, toLine } = effect.value;
        const doc = tr.state.doc;
        const from = doc.line(Math.max(1, fromLine)).from;
        const to = doc.line(Math.min(doc.lines, toLine)).to;
        return Decoration.set([
          Decoration.mark({ class: "cm-esphome-highlight" }).range(from, to),
        ]);
      }
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

@customElement("esphome-yaml-editor")
export class ESPHomeYamlEditor extends LitElement {
  @consume({ context: darkModeContext, subscribe: true })
  @state()
  private _darkMode = false;

  @consume({ context: apiContext })
  private _api?: ESPHomeAPI;

  @property() value = "";

  @property() configuration = "";

  @property({ attribute: false }) highlightRange: HighlightRange | null = null;

  @property({ type: Boolean }) scrollToHighlight = false;

  @query(".cm-wrap") private _container!: HTMLDivElement;

  private _view: EditorView | null = null;

  static styles = css`
    :host {
      display: block;
      position: relative;
      flex: 1;
      min-height: 0;
    }

    .cm-wrap {
      position: absolute;
      inset: 0;
    }
  `;

  protected render() {
    return html`<div class="cm-wrap"></div>`;
  }

  protected firstUpdated() {
    this._mountEditor();
  }

  private _mountEditor() {
    this._view = new EditorView({
      state: EditorState.create({
        doc: this.value,
        extensions: [
          basicSetup,
          esphomeYaml(),
          highlightField,
          yamlLinter,
          ...(this._api
            ? [
                createBackendYamlLinter({
                  api: this._api,
                  getConfiguration: () => this.configuration,
                }),
                createYamlCompletion(this._api),
              ]
            : []),
          lintGutter(),
          EditorView.theme({
            "&": { height: "100%" },
            ".cm-scroller": {
              overflow: "auto",
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              fontSize: "13px",
            },
            ".cm-esphome-highlight": {
              background: this._darkMode
                ? "rgba(99, 179, 237, 0.2)"
                : "rgba(59, 130, 246, 0.1)",
            },
            ".cm-tooltip-lint": {
              maxWidth: "520px",
              borderRadius: "8px",
              border: this._darkMode
                ? "1px solid #30363d"
                : "1px solid #d0d7de",
              background: this._darkMode ? "#161b22" : "#ffffff",
              color: this._darkMode ? "#e6edf3" : "#1f2328",
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              padding: "10px 12px",
              fontSize: "12px",
              lineHeight: "1.5",
            },
            ".cm-diagnostic": {
              padding: "0",
              borderLeft: "none",
              background: "transparent",
            },
            ".cm-diagnostic-error": {
              borderLeft: "3px solid #cf222e",
              paddingLeft: "10px",
            },
            ".esphome-lint-reason": {
              fontWeight: "600",
              marginBottom: "6px",
              color: this._darkMode ? "#ffcecb" : "#cf222e",
            },
            ".esphome-lint-snippet": {
              margin: "0",
              padding: "8px 10px",
              borderRadius: "6px",
              background: this._darkMode ? "#0d1117" : "#f6f8fa",
              color: this._darkMode ? "#e6edf3" : "#1f2328",
              fontFamily:
                '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
              fontSize: "11px",
              whiteSpace: "pre",
              overflowX: "auto",
            },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              this.dispatchEvent(
                new CustomEvent("yaml-change", {
                  detail: { value: update.state.doc.toString() },
                  bubbles: true,
                  composed: true,
                })
              );
            }
          }),
          ...(this._darkMode ? [oneDark] : []),
        ],
      }),
      parent: this._container,
    });

    // Apply any pending highlight after mount
    if (this.highlightRange) {
      this._view.dispatch({ effects: setHighlight.of(this.highlightRange) });
    }
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("_darkMode") && this._view) {
      const doc = this._view.state.doc.toString();
      this._view.destroy();
      this._container.innerHTML = "";
      this.value = doc;
      this._mountEditor();
      return;
    }

    if (changed.has("value") && this._view) {
      const current = this._view.state.doc.toString();
      if (current !== this.value) {
        this._view.dispatch({
          changes: { from: 0, to: current.length, insert: this.value },
        });
      }
    }

    if (changed.has("highlightRange") && this._view) {
      this._view.dispatch({ effects: setHighlight.of(this.highlightRange) });
      if (this.highlightRange && this.scrollToHighlight) {
        const line = Math.max(1, this.highlightRange.fromLine);
        const pos = this._view.state.doc.line(Math.min(line, this._view.state.doc.lines)).from;
        this._view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "start", yMargin: 50 }) });
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._view?.destroy();
    this._view = null;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-yaml-editor": ESPHomeYamlEditor;
  }
}
