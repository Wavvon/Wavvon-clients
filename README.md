# Voxply Clients

[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

The client monorepo for [Voxply](https://github.com/Voxply/Voxply) — an
open-source, federated voice + text platform where communities run
their own servers and **your identity is a keypair, not an account**.

This one repo holds every Voxply client — desktop, web, and Android —
plus the shared TypeScript packages they have in common. They were
previously three separate repos (Voxply-desktop, Voxply-web,
Voxply-android); consolidating them into a single pnpm workspace removed
the duplicate-React hazard, the cross-repo Vite aliases, and the
multi-checkout release dance.

## Monorepo layout

```
clients/
├── apps/
│   ├── desktop/        Tauri 2 desktop app — React UI + Rust shell (v0.2.4)
│   ├── web/            Vite + React browser SPA (v0.2.0)
│   └── android/
│       ├── voxply-desktop/   Android (Tauri) build of the desktop client
│       └── voxply-web/       Android (Tauri) build of the web client
├── packages/
│   ├── core/           @voxply/core  — shared TS: hub-input/invite parsing, more to come
│   ├── i18n/           @voxply/i18n  — locale strings + ICU i18n machinery
│   ├── utils/          @voxply/utils — shared utilities (format, channels, hex, …)
│   ├── ui/             @voxply/ui    — shared React components (stub, future)
│   └── platform/       @voxply/platform — platform-adapter interface (stub, future)
├── voice/              Rust voice codec library (cpal, Opus, RNNoise)
├── Cargo.toml          Rust workspace: apps/desktop/src-tauri + voice
├── package.json        pnpm workspace root
└── pnpm-workspace.yaml
```

The **apps** are end-user clients; the **packages** are internal
`workspace:*` libraries the apps depend on (no published npm releases).
The Rust `voice` crate is shared by the desktop and Android Tauri shells.

## The clients

- **Desktop** (`apps/desktop`) — native app for Windows, macOS, and
  Linux built with Tauri 2 (Rust shell + system WebView) and React.
  The only client with full live voice: a real native audio pipeline
  (Opus over UDP, RNNoise denoise, VAD, push-to-talk), video + screen
  share, and end-to-end-encrypted DMs.
- **Web** (`apps/web`) — zero-install browser SPA. A deliberate feature
  subset: full text, forums, E2E DMs, and admin tooling work in the
  browser; live voice is desktop-only (browsers can't speak the hub's
  UDP voice protocol). Identity lives in IndexedDB and never leaves the
  device.
- **Android** (`apps/android`) — two Tauri 2 wrappers packaged as APKs,
  mirroring the desktop and web UIs for mobile. Same hub API as every
  other client.

All clients share one Ed25519 keypair identity with a 24-word BIP39
recovery phrase and QR multi-device pairing. No accounts, no telemetry.

## Quick start

Requires [Node 20+](https://nodejs.org) and
[pnpm 11+](https://pnpm.io). For the desktop/Android Rust shells you
also need Rust and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your
OS (Android additionally needs the Android SDK + NDK).

Install all workspace dependencies once from the repo root:

```bash
pnpm install
```

Then run the client you want. `pnpm --filter <app>` targets a single
workspace package by its `package.json` name:

```bash
pnpm --filter voxply-desktop run tauri dev   # desktop app (native window)
pnpm --filter voxply-web run dev             # web app  → http://localhost:1421
```

Each client opens with an "Add a hub" prompt. Paste a hub URL
(`http://localhost:3000` for a local dev hub — see
[Voxply-server](https://github.com/Voxply/Voxply-server) to run one in
2 minutes) to connect.

> The `apps/desktop` and `apps/android/voxply-desktop` packages share
> the npm name `voxply-desktop` (likewise `voxply-web`). When a filter is
> ambiguous, target by path instead, e.g.
> `pnpm --filter ./apps/desktop run dev`.

## Build & checks

From the repo root, `pnpm -r` fans a script out across every workspace
package that defines it:

```bash
pnpm -r run build         # build all apps + packages
pnpm -r run typecheck     # tsc --noEmit everywhere
pnpm -r run test          # vitest suites
cargo check --workspace   # Rust: voice crate + desktop src-tauri
```

Release builds for the native apps go through Tauri:

```bash
pnpm --filter voxply-desktop run tauri build
# Output: apps/desktop/src-tauri/target/release/bundle/

pnpm --filter voxply-web run build
# Output: apps/web/dist/  (static bundle, serve from any host or CDN)
```

Android release APKs and signing are documented in
[`apps/android/README.md`](apps/android/README.md).

## Downloads & installer warnings

Desktop installers (Windows `.exe`, macOS `.dmg`, Linux `.AppImage`)
ship from the project's GitHub Releases. Builds are reproducible from
this public repo but are **not code-signed yet** (deferred until the
project qualifies for an open-source signing program):

- **Windows**: SmartScreen warns about an unrecognized app — click
  **More info → Run anyway**.
- **macOS**: not notarized — right-click the app and choose **Open** the
  first time.
- **Linux**: `chmod +x Voxply*.AppImage`, then run it.

On first launch the app generates your identity and shows your recovery
phrase — write it down.

## The Voxply project

| Repo | What it is |
|---|---|
| **Voxply-client** *(this repo)* | All clients (desktop / web / Android) + shared packages |
| [Voxply-server](https://github.com/Voxply/Voxply-server) | Hub server, farm tooling, identity crate (Rust) |
| [Voxply-discovery](https://github.com/Voxply/Voxply-discovery) | Optional public hub directory |
| [Voxply](https://github.com/Voxply/Voxply) | Architecture wiki, roadmap, API spec |

New here? Start with
[getting-started.md](https://github.com/Voxply/Voxply/blob/main/docs/getting-started.md)
and the
[architecture overview](https://github.com/Voxply/Voxply/blob/main/docs/architecture.md).

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[GNU Affero General Public License v3.0](LICENSE).

## Built with AI assistance

This project was built with substantial help from
[Claude](https://claude.ai) (Anthropic's AI assistant). The product
owner directs architecture, features, and tradeoffs; Claude drafts
most of the code, tests, and documentation, which is then reviewed,
adjusted, and accepted.

Calling this out for transparency — it's not a fully hand-written
codebase, and pretending otherwise wouldn't be honest.
