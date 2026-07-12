# Wavvon Clients

[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

The client monorepo for [Wavvon](https://github.com/Wavvon/Wavvon-docs) — an
open-source, federated voice + text platform where communities run
their own servers and **your identity is a keypair, not an account**.

This one repo holds the Wavvon clients — desktop and web — plus the
shared TypeScript packages they have in common. They were previously
separate repos; consolidating them into a single pnpm workspace removed
the duplicate-React hazard, the cross-repo Vite aliases, and the
multi-checkout release dance.

> A Tauri 2 Android client previously lived here at `apps/android`. It
> was removed 2026-07-12 — it had fallen too far behind to maintain and
> is slated for a clean-slate rewrite when mobile becomes a priority.
> See [android-rewrite-notes.md](https://github.com/Wavvon/Wavvon-docs/blob/main/docs/android-rewrite-notes.md)
> (build/native learnings) in Wavvon-docs.

## Monorepo layout

```
clients/
├── apps/
│   ├── desktop/        Tauri 2 desktop app — React UI + Rust shell
│   └── web/            Vite + React browser SPA
├── crates/
│   └── voice/          Rust voice codec library (cpal, Opus, RNNoise)
├── packages/
│   ├── core/           @wavvon/core     — crypto, hub-input parsing, shared utils
│   ├── i18n/           @wavvon/i18n     — locale strings + ICU i18n machinery
│   ├── ui/             @wavvon/ui       — shared React components + canonical CSS
│   └── platform/       @wavvon/platform — platform-adapter interface
├── scripts/
├── Cargo.toml          Rust workspace: apps/desktop/src-tauri + crates/voice
├── package.json        pnpm workspace root
└── pnpm-workspace.yaml
```

The **apps** are end-user clients; the **packages** are internal
`workspace:*` libraries the apps depend on (no published npm releases).
The Rust `voice` crate is used by the desktop Tauri shell.

## The clients

- **Desktop** (`apps/desktop`) — native app for Windows, macOS, and
  Linux built with Tauri 2 (Rust shell + system WebView) and React.
  Live voice through a native audio pipeline (Opus over UDP, RNNoise
  denoise, VAD, push-to-talk), video + screen share, and
  end-to-end-encrypted DMs.
- **Web** (`apps/web`) — zero-install browser SPA with the full feature
  set: text, forums, E2E DMs, admin tooling, and live voice over the
  hub's WebSocket audio relay, plus webcam video and screen share via
  WebRTC. Identity lives in IndexedDB and never leaves the device.
All clients share one Ed25519 keypair identity with a 24-word BIP39
recovery phrase and QR multi-device pairing. No accounts, no telemetry.

## Quick start

Requires [Node 20+](https://nodejs.org) and
[pnpm 11+](https://pnpm.io). For the desktop Rust shell you also need
Rust and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your
OS.

Install all workspace dependencies once from the repo root:

```bash
pnpm install
```

Then run the client you want. `pnpm --filter <app>` targets a single
workspace package by its `package.json` name:

```bash
pnpm --filter wavvon-desktop run tauri dev   # desktop app (native window)
pnpm --filter wavvon-web run dev             # web app  → http://localhost:1421
```

Each client opens with an "Add a hub" prompt. Paste a hub URL
(`http://localhost:3000` for a local dev hub — see
[Wavvon-server](https://github.com/Wavvon/Wavvon-server) to run one in
2 minutes) to connect.

> If a filter name is ambiguous, target by path instead, e.g.
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
pnpm --filter wavvon-desktop run tauri build
# Output: apps/desktop/src-tauri/target/release/bundle/

pnpm --filter wavvon-web run build
# Output: apps/web/dist/  (static bundle, serve from any host or CDN)
```

## Downloads & installer warnings

Desktop installers (Windows `.exe`, macOS `.dmg`, Linux `.AppImage`)
ship from the project's GitHub Releases. Builds are reproducible from
this public repo but are **not code-signed yet** (deferred until the
project qualifies for an open-source signing program):

- **Windows**: SmartScreen warns about an unrecognized app — click
  **More info → Run anyway**.
- **macOS**: not notarized — right-click the app and choose **Open** the
  first time.
- **Linux**: `chmod +x Wavvon*.AppImage`, then run it.

On first launch the app generates your identity and shows your recovery
phrase — write it down.

## The Wavvon project

| Repo | What it is |
|---|---|
| **Wavvon-clients** *(this repo)* | All clients (desktop / web) + shared packages |
| [Wavvon-server](https://github.com/Wavvon/Wavvon-server) | Hub server, farm tooling, identity crate (Rust) |
| [Wavvon-discovery](https://github.com/Wavvon/Wavvon-discovery) | Optional public hub directory |
| [Wavvon-docs](https://github.com/Wavvon/Wavvon-docs) | Architecture wiki, roadmap, API spec |

New here? Start with
[getting-started.md](https://github.com/Wavvon/Wavvon-docs/blob/main/docs/getting-started.md)
and the
[architecture overview](https://github.com/Wavvon/Wavvon-docs/blob/main/docs/architecture.md).

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
