import { linter, type Diagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import type { Text } from "@codemirror/state";
import type { ESPHomeAPI } from "../api/index.js";
import type {
  ValidateYamlResult,
  ValidationError,
  YamlError,
} from "../api/types.js";

interface BackendLinterOpts {
  api: ESPHomeAPI;
  getConfiguration: () => string;
  delay?: number;
}

const YAML_ERROR_RE = /line\s+(\d+)\s*,\s*column\s+(\d+)/i;

export function createBackendYamlLinter(opts: BackendLinterOpts) {
  return linter(
    async (view: EditorView): Promise<readonly Diagnostic[]> => {
      const configuration = opts.getConfiguration();
      if (!configuration) return [];
      const content = view.state.doc.toString();
      if (!content.trim()) return [];

      let result: ValidateYamlResult;
      try {
        result = await opts.api.validateYaml(configuration, content);
      } catch {
        return [];
      }

      const diagnostics: Diagnostic[] = [];
      for (const err of result.yaml_errors) {
        const d = yamlErrorToDiagnostic(err, view.state.doc);
        if (d) diagnostics.push(d);
      }
      for (const err of result.validation_errors) {
        const d = validationErrorToDiagnostic(err, view.state.doc);
        if (d) diagnostics.push(d);
      }
      return diagnostics;
    },
    { delay: opts.delay ?? 600 }
  );
}

function yamlErrorToDiagnostic(err: YamlError, doc: Text): Diagnostic | null {
  const match = err.message.match(YAML_ERROR_RE);
  const reason = err.message.split("\n")[0]?.trim() || err.message;
  if (!match) {
    return { from: 0, to: 0, severity: "error", message: reason };
  }
  // The PyYAML message reports 1-indexed line/column.
  const line = clampLine(parseInt(match[1], 10), doc.lines);
  const col = Math.max(0, parseInt(match[2], 10) - 1);
  const lineInfo = doc.line(line);
  const from = Math.min(lineInfo.from + col, lineInfo.to);
  return {
    from,
    to: lineInfo.to,
    severity: "error",
    message: reason,
  };
}

function validationErrorToDiagnostic(
  err: ValidationError,
  doc: Text
): Diagnostic | null {
  if (!err.range) {
    return { from: 0, to: 0, severity: "error", message: err.message };
  }
  // ESPHome's vscode protocol emits 0-indexed line/column.
  const startLine = clampLine(err.range.start_line + 1, doc.lines);
  const endLine = clampLine(err.range.end_line + 1, doc.lines);
  const startInfo = doc.line(startLine);
  const endInfo = doc.line(endLine);
  const from = Math.min(startInfo.from + err.range.start_col, startInfo.to);
  const to = Math.min(endInfo.from + err.range.end_col, endInfo.to);
  return {
    from,
    to: Math.max(from + 1, to),
    severity: "error",
    message: err.message,
  };
}

function clampLine(line: number, totalLines: number): number {
  return Math.max(1, Math.min(totalLines, line));
}
