/**
 * Shared CSS styles for ESPHome frontend components.
 */
import { css } from "lit";

/** ESPHome brand colors and design tokens. */
export const espHomeStyles = css`
  :host {
    --esphome-primary: #038fc7;
    --esphome-primary-light: #4db8e0;
    --esphome-primary-dark: #026a94;
    --esphome-success: #2ecc71;
    --esphome-warning: #f39c12;
    --esphome-error: #e74c3c;
    --esphome-offline: #95a5a6;

    --esphome-sidebar-width: 260px;
    --esphome-header-height: 56px;

    --esphome-font-family: system-ui, -apple-system, sans-serif;
    --esphome-font-mono: "SF Mono", "Fira Code", "Fira Mono", monospace;

    font-family: var(--esphome-font-family);
  }
`;

/** Common layout helpers. */
export const layoutStyles = css`
  .page-content {
    padding: 24px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 16px;
  }

  .flex-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .flex-col {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .spacer {
    flex: 1;
  }
`;
