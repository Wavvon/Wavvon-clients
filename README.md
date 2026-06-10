# Voxply Desktop

[![Build check](https://github.com/Voxply/Voxply-desktop/actions/workflows/build.yml/badge.svg)](https://github.com/Voxply/Voxply-desktop/actions/workflows/build.yml)
[![Release](https://github.com/Voxply/Voxply-desktop/actions/workflows/release.yml/badge.svg)](https://github.com/Voxply/Voxply-desktop/actions/workflows/release.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

The desktop client for [Voxply](https://github.com/Voxply/Voxply) — an
open-source, federated voice + text platform where communities run
their own servers and **your identity is a keypair, not an account**.
Native app for Windows, macOS, and Linux built with Tauri 2 (Rust
shell, system WebView) and React, with a real native audio pipeline —
no browser limitations on voice.

## Features

- **Voice that feels native** — Opus over UDP with RNNoise denoising,
  voice activity detection, push-to-talk, audio quality profiles
  (Standard / Music / Custom), per-participant volume, whisper to
  selected users or channels, and proximity voice for games.
- **Video & screen share** — webcam in any channel, multi-sharer screen
  share in independent draggable overlay windows.
- **Private by design** — end-to-end-encrypted 1:1 and group DMs
  (X25519 + AES-256-GCM); keys are generated and stay on your device.
  No telemetry.
- **One identity, every device** — Ed25519 keypair with a 24-word
  recovery phrase, QR multi-device pairing, passphrase-encrypted
  identity backups, and optional recovery contacts.
- **Everything a community needs** — markdown messages, attachments
  and uploads, reactions, replies and threads, pins, polls, events,
  forum channels, custom emojis, global search, drafts.
- **Make it yours** — four built-in themes plus a custom skin editor
  with shareable `.voxplyskin` files; localized UI; keyboard
  navigation and screen-reader support throughout.

## Download

Grab the installer for your platform from the
[Releases page](https://github.com/Voxply/Voxply-desktop/releases):
Windows (`.exe`), macOS (`.dmg`), Linux (`.AppImage`).

**A note on installer warnings** — Voxply builds are reproducible from
this public repository via GitHub Actions, but the installers are not
yet code-signed (signing for a young open-source project is in
progress — see [CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md)):

- **Windows**: SmartScreen will warn about an unrecognized app. Click
  **More info → Run anyway**.
- **macOS**: the app is not notarized yet. Right-click the app and
  choose **Open** the first time.
- **Linux**: `chmod +x Voxply*.AppImage`, then run it.

On first launch the app generates your identity and shows your recovery
phrase — write it down. Then click **Add hub** and enter the URL of a
hub you want to join, or
[run your own](https://github.com/Voxply/Voxply-server).

## Build from source

Requires [Node 20+](https://nodejs.org), Rust, and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your
OS. The desktop app shares i18n/util packages with the web client, so
clone [Voxply-web](https://github.com/Voxply/Voxply-web) next to this
repo as `web`:

```bash
git clone https://github.com/Voxply/Voxply-desktop
git clone https://github.com/Voxply/Voxply-web web   # shared @voxply/i18n + @voxply/utils
cd Voxply-desktop/desktop
npm install
npm run tauri dev
```

The window opens with an "Add a hub" prompt. Paste a hub URL
(`http://localhost:3000` for a local dev hub) to connect.

### Release build

```bash
cd desktop
npm run tauri build
# Output: src-tauri/target/release/bundle/
```

### Checks & tests

```bash
cd desktop
npx tsc --noEmit            # TypeScript
npm test                    # vitest
cargo check --workspace     # Rust (from the repo root)
```

## Repository layout

| Path | What it is |
|---|---|
| `desktop/src/` | React UI |
| `desktop/src-tauri/` | Rust shell: identity, E2E crypto, voice, HTTP, OS integration |
| `voice/` | Audio pipeline crate: cpal capture → RNNoise → Opus → UDP |

## The Voxply project

| Repo | What it is |
|---|---|
| [Voxply-server](https://github.com/Voxply/Voxply-server) | Hub server, farm tooling, identity crate (Rust) |
| **Voxply-desktop** *(this repo)* | Desktop client — Windows / macOS / Linux (Tauri 2 + React) |
| [Voxply-web](https://github.com/Voxply/Voxply-web) | Browser client (text + DMs) |
| [Voxply-android](https://github.com/Voxply/Voxply-android) | Android client (Tauri 2) |
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
