# ESPHome Device Builder Dashboard Frontend

A web-based dashboard for managing, configuring, and deploying ESPHome IoT device firmware. Built with Lit web components and TypeScript.

## Tech Stack

- **[Lit](https://lit.dev/)** — Web components framework
- **TypeScript** — Strict mode throughout
- **[Rspack](https://rspack.dev/)** — Rust-based bundler
- **[Web Awesome](https://www.webawesome.com/)** — UI component library (Home Assistant variant)
- **[CodeMirror](https://codemirror.net/)** — YAML editor with syntax highlighting
- **[Sonner](https://sonner.emilkowal.dev/)** — Toast notifications

## Getting Started

### Prerequisites

- Node.js (with npm)
- An ESPHome backend running on `localhost:6052`

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

Starts a dev server at `http://localhost:5173` with HMR. API calls are proxied to the ESPHome backend at `localhost:6052`.

### Production Build

```bash
npm run build
```

Outputs optimized assets to `dist/`.

### Other Scripts

| Script           | Description                       |
| ---------------- | --------------------------------- |
| `npm run lint`   | TypeScript type checking          |
| `npm run format` | Format source files with Prettier |

## Project Structure

```
src/
├── api/            # HTTP/WebSocket API client and types
├── components/     # Lit web components
│   ├── device/     # Device editor, navigator, component catalog
│   └── wizard/     # Device creation wizard steps
├── pages/          # Routed page components (dashboard, device, secrets)
├── context/        # Lit Context definitions
├── common/         # i18n / localization
├── util/           # Helpers (debounce, YAML parsing, icons, etc.)
├── styles/         # Theme and shared styles
├── translations/   # Language files (en, fr, nl)
└── entrypoint.ts   # App bootstrap
```

## Status

### Disabled features

The frontend is wired up for some features the backend doesn't expose yet. Anything in this list is gated behind a flag in [`src/feature-flags.ts`](src/feature-flags.ts) — flip the flag to re-enable once the backend lands.

- **Automations** (`AUTOMATIONS_ENABLED`) — the navigator's "Automations" group is still visible and lists existing automations parsed from the YAML, but the "+ Add automation" action button is greyed out (and the underlying dialog isn't mounted). The ESPHome WebSocket API doesn't yet expose the endpoints the UI needs to add new ones (catalog of triggers / conditions / actions, schema lookups, save-back hooks). Re-enable by setting `AUTOMATIONS_ENABLED = true` once those land.

## License

Apache 2.0
