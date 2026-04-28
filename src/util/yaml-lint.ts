import { linter, type Diagnostic } from "@codemirror/lint";
import { load, YAMLException } from "js-yaml";

export const yamlLinter = linter((view) => {
  const text = view.state.doc.toString();
  if (!text.trim()) return [];

  try {
    load(text);
    return [];
  } catch (err) {
    if (!(err instanceof YAMLException)) return [];
    const diagnostic = toDiagnostic(err, view.state.doc.length);
    return diagnostic ? [diagnostic] : [];
  }
});

function toDiagnostic(err: YAMLException, docLength: number): Diagnostic | null {
  const mark = err.mark;
  const from = clamp(mark?.position ?? 0, 0, docLength);
  const to = clamp(from + 1, from, docLength);
  const message = err.reason || err.message || "YAML parse error";
  return {
    from,
    to,
    severity: "error",
    message,
    renderMessage: () => renderMessage(err),
  };
}

function renderMessage(err: YAMLException): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "esphome-lint-message";

  const reason = document.createElement("div");
  reason.className = "esphome-lint-reason";
  reason.textContent = err.reason || err.message || "YAML parse error";
  wrap.appendChild(reason);

  if (err.mark?.snippet) {
    const snippet = document.createElement("pre");
    snippet.className = "esphome-lint-snippet";
    snippet.textContent = err.mark.snippet;
    wrap.appendChild(snippet);
  }

  return wrap;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
