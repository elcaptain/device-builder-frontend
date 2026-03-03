/**
 * Sidebar navigation component.
 *
 * Features:
 * - Navigation links with MDI icons
 * - Active state tracking based on current URL
 * - Dark mode toggle
 * - ESPHome version display
 */
import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { consume } from "@lit/context";
import { versionContext, darkModeContext } from "../context/index.js";
import { espHomeStyles } from "../styles/shared.js";
import { registerMdiIcons } from "../util/register-icons.js";
import { mdiChip, mdiPlus, mdiWeatherNight, mdiWeatherSunny } from "@mdi/js";

import "@home-assistant/webawesome/dist/components/divider/divider.js";
import "@home-assistant/webawesome/dist/components/icon/icon.js";

// Register icons used by the sidebar
registerMdiIcons({
  chip: mdiChip,
  plus: mdiPlus,
  "weather-night": mdiWeatherNight,
  "weather-sunny": mdiWeatherSunny,
});

interface NavItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { path: "/", label: "Devices", icon: "chip", exact: true },
  { path: "/device/add", label: "New Device", icon: "plus" },
];

@customElement("esphome-sidebar")
export class ESPHomeSidebar extends LitElement {
  @consume({ context: versionContext, subscribe: true })
  @state()
  private _version = "";

  @consume({ context: darkModeContext, subscribe: true })
  @state()
  private _darkMode = false;

  @state()
  private _currentPath = window.location.pathname;

  static styles = [
    espHomeStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        width: var(--esphome-sidebar-width);
        background: var(--wa-color-surface-raised, #ffffff);
        border-right: 1px solid var(--wa-color-surface-border, #dee2e6);
        height: 100%;
        overflow-y: auto;
      }

      .logo {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 20px 20px 16px;
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--esphome-primary);
        text-decoration: none;
        cursor: pointer;
      }

      .logo:hover {
        opacity: 0.85;
      }

      .logo-icon {
        width: 36px;
        height: 36px;
        flex-shrink: 0;
      }

      nav {
        flex: 1;
        padding: 8px 12px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .nav-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        color: var(--wa-color-text-normal, #495057);
        text-decoration: none;
        font-size: 0.9rem;
        cursor: pointer;
        transition:
          background 0.15s,
          color 0.15s;
        border: none;
        background: none;
        text-align: left;
        border-radius: 8px;
        line-height: 1;
      }

      .nav-item wa-icon {
        font-size: 1.25rem;
        flex-shrink: 0;
      }

      .nav-item:hover {
        background: var(--wa-color-surface-lowered, #f1f3f5);
        color: var(--esphome-primary);
      }

      .nav-item.active {
        background: color-mix(in srgb, var(--esphome-primary), transparent 88%);
        color: var(--esphome-primary);
        font-weight: 600;
      }

      .nav-item.active wa-icon {
        color: var(--esphome-primary);
      }

      .sidebar-footer {
        padding: 12px;
        border-top: 1px solid var(--wa-color-surface-border, #dee2e6);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .dark-mode-toggle {
        cursor: pointer;
      }

      .version {
        padding: 4px 12px;
        font-size: 0.75rem;
        color: var(--wa-color-text-quiet, #adb5bd);
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("popstate", this._handlePopState);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("popstate", this._handlePopState);
  }

  protected render() {
    return html`
      <a class="logo" href="/">
        <svg class="logo-icon" viewBox="0 0 240 240" fill="currentColor">
          <circle
            cx="120"
            cy="120"
            r="110"
            fill="none"
            stroke="currentColor"
            stroke-width="12"
          />
          <text x="120" y="140" text-anchor="middle" font-size="90" font-weight="bold">
            E
          </text>
        </svg>
        ESPHome
      </a>
      <wa-divider></wa-divider>
      <nav>${NAV_ITEMS.map((item) => this._renderNavItem(item))}</nav>
      <div class="sidebar-footer">
        <button class="dark-mode-toggle nav-item" @click=${this._handleDarkModeToggle}>
          <wa-icon
            library="mdi"
            name=${this._darkMode ? "weather-sunny" : "weather-night"}
          ></wa-icon>
          ${this._darkMode ? "Light Mode" : "Dark Mode"}
        </button>
        ${this._version
          ? html`<div class="version">ESPHome v${this._version}</div>`
          : nothing}
      </div>
    `;
  }

  private _renderNavItem(item: NavItem) {
    const isActive = item.exact
      ? this._currentPath === item.path
      : this._currentPath.startsWith(item.path);

    return html`
      <a
        class=${classMap({ "nav-item": true, active: isActive })}
        href=${item.path}
        @click=${this._handleNavClick}
      >
        <wa-icon library="mdi" name=${item.icon}></wa-icon>
        ${item.label}
      </a>
    `;
  }

  private _handleNavClick = () => {
    // Update current path after navigation settles
    requestAnimationFrame(() => {
      this._currentPath = window.location.pathname;
    });
  };

  private _handlePopState = () => {
    this._currentPath = window.location.pathname;
  };

  private _handleDarkModeToggle() {
    this.dispatchEvent(
      new CustomEvent("toggle-dark-mode", {
        bubbles: true,
        composed: true,
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-sidebar": ESPHomeSidebar;
  }
}
