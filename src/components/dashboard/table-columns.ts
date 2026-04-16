import { html, nothing } from "lit";
import type { ColumnDef } from "@tanstack/lit-table";
import { DeviceState } from "../../api/types.js";
import type { ConfiguredDevice } from "../../api/types.js";
import type { LocalizeFunc } from "../../common/localize.js";

export interface DeviceRow {
  status: DeviceState;
  name: string;
  friendly_name: string;
  ip: string;
  platform: string;
  version: string;
  comment: string;
  tags: string[];
  config: string;
  hasPendingChanges: boolean;
  hasUpdateAvailable: boolean;
  _device: ConfiguredDevice;
}

export function createDeviceColumns(localize: LocalizeFunc): ColumnDef<DeviceRow>[] {
  return [
    {
      accessorKey: "status",
      header: localize("dashboard.table_col_status"),
      cell: (info) => {
        const state = info.getValue() as DeviceState;
        const dotClass = state === DeviceState.ONLINE ? "online" : "offline";
        const title = state === DeviceState.ONLINE
          ? localize("dashboard.table_status_online")
          : state === DeviceState.OFFLINE
            ? localize("dashboard.table_status_offline")
            : localize("dashboard.table_status_unknown");
        return html`<span
          class="status-dot ${dotClass}"
          title="${title}"
        ></span>`;
      },
      size: 80,
      enableHiding: true,
    },
    {
      accessorKey: "name",
      header: localize("dashboard.table_col_name"),
      cell: (info) => {
        const row = info.row.original;
        return html`<span class="cell-name-wrap">
          <span class="cell-name">${row.friendly_name || row.name}</span>
          ${row.hasPendingChanges
            ? html`<span class="cell-indicator cell-indicator--modified" title=${localize("dashboard.status_modified")}></span>`
            : nothing}
          ${row.hasUpdateAvailable
            ? html`<span class="cell-indicator cell-indicator--update" title=${localize("dashboard.status_update_available")}></span>`
            : nothing}
        </span>`;
      },
      size: 200,
      enableHiding: true,
    },
    {
      accessorKey: "ip",
      header: localize("dashboard.table_col_ip"),
      cell: (info) =>
        html`<span class="cell-mono">${info.getValue() || "\u2014"}</span>`,
      size: 140,
      enableHiding: true,
    },
    {
      accessorKey: "platform",
      header: localize("dashboard.table_col_platform"),
      cell: (info) => {
        const val = info.getValue() as string;
        return val
          ? html`<span class="cell-badge">${val}</span>`
          : html`<span class="cell-muted">\u2014</span>`;
      },
      size: 120,
      enableHiding: true,
    },
    {
      accessorKey: "version",
      header: localize("dashboard.table_col_version"),
      cell: (info) =>
        html`<span class="cell-mono">${info.getValue() || "\u2014"}</span>`,
      size: 150,
      enableHiding: true,
    },
    {
      accessorKey: "comment",
      header: localize("dashboard.table_col_comment"),
      cell: (info) =>
        html`<span class="cell-comment">${info.getValue() || "\u2014"}</span>`,
      size: 180,
      enableHiding: true,
    },
    {
      accessorKey: "tags",
      header: localize("dashboard.table_col_tags"),
      cell: (info) => {
        const tags = info.getValue() as string[];
        if (!tags || tags.length === 0)
          return html`<span class="cell-muted">\u2014</span>`;
        return html`<span class="cell-tags"
          >${tags.map((t) => html`<span class="tag">${t}</span>`)}</span
        >`;
      },
      size: 160,
      enableHiding: true,
    },
    {
      accessorKey: "config",
      header: localize("dashboard.table_col_config"),
      cell: (info) =>
        html`<span class="cell-mono cell-config">${info.getValue()}</span>`,
      size: 180,
      enableHiding: true,
    },
  ];
}
