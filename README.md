# Voxply Web

[![Build check](https://github.com/Voxply/Voxply-web/actions/workflows/build.yml/badge.svg)](https://github.com/Voxply/Voxply-web/actions/workflows/build.yml)
[![Deploy to GitHub Pages](https://github.com/Voxply/Voxply-web/actions/workflows/deploy.yml/badge.svg)](https://github.com/Voxply/Voxply-web/actions/workflows/deploy.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

The browser client for [Voxply](https://github.com/Voxply/Voxply) — an
open-source, federated voice + text platform where communities run
their own servers and **your identity is a keypair, not an account**.
Nothing to install: the web client runs entirely in the browser, talks
to any Voxply hub over plain HTTP + WebSocket, and keeps your identity
local (Web Crypto Ed25519 keys stored in IndexedDB — never sent to any
server).

It is a deliberate **feature subset** of the desktop client: text chat,
forums, E2E DMs, screen-share viewing, and admin tooling all work in
the browser; live voice needs the
[desktop app](https://github.com/Voxply/Voxply-desktop) (browsers can't
speak the hub's UDP voice protocol).

![Creating an identity and joining a hub from the browser - no signup, no install](https://raw.githubusercontent.com/Voxply/Voxply/main/assets/join-flow.gif)

## Features

- **Zero install, zero account** — open the page, an Ed25519 identity
  is generated on your device with a 24-word recovery phrase.
- **Full text experience** — channels with markdown, attachments and
  uploads, reactions, replies and threads, pins, polls, events, forum
  channels, custom emojis, search, drafts, typing indicators, unread
  tracking.
- **E2E-encrypted DMs** — 1:1 and group DMs encrypted in the browser
  (X25519 + AES-256-GCM via `@noble` primitives); the hub only ever
  sees ciphertext.
- **Identity portability** — passphrase-encrypted identity backups,
  interchangeable with the other clients.
- **Make it yours** — themes plus a custom skin editor with shareable
  `.voxplyskin` files; localized UI; keyboard navigation and
  screen-reader support.
- **Self-hostable** — the production build is a static bundle; serve
  `dist/` from any web server or CDN. Tagged releases are also
  auto-deployed to GitHub Pages from CI.

## Quick start

Requires [Node 20+](https://nodejs.org).

```bash
git clone https://github.com/Voxply/Voxply-web
cd Voxply-web/web
npm install
npm run dev
# Open http://localhost:1421
```

Click **Add hub** and enter a hub URL (`http://localhost:3000` for a
local dev hub — see [Voxply-server](https://github.com/Voxply/Voxply-server)
to run one in 2 minutes).

## Building & checks

```bash
cd web
npm run build        # static bundle in dist/
npm run typecheck    # tsc --noEmit
npm test             # vitest
```

## Repository layout

| Path | What it is |
|---|---|
| `web/` | The React client (Vite) |
| `i18n/` | Shared `@voxply/i18n` package (also used by the desktop client) |
| `utils/` | Shared `@voxply/utils` package |

## The Voxply project

| Repo | What it is |
|---|---|
| [Voxply-server](https://github.com/Voxply/Voxply-server) | Hub server, farm tooling, identity crate (Rust) |
| [Voxply-desktop](https://github.com/Voxply/Voxply-desktop) | Desktop client — Windows / macOS / Linux (Tauri 2 + React) |
| **Voxply-web** *(this repo)* | Browser client (text + DMs) |
| [Voxply-android](https://github.com/Voxply/Voxply-android) | Android client (Tauri 2) |
| [Voxply-discovery](https://github.com/Voxply/Voxply-discovery) | Optional public hub directory |
| [Voxply](https://github.com/Voxply/Voxply) | Architecture wiki, roadmap, API spec |

New here? Start with
[getting-started.md](https://github.com/Voxply/Voxply/blob/main/docs/getting-started.md);
the browser client's design rationale is in
[browser-client.md](https://github.com/Voxply/Voxply/blob/main/docs/browser-client.md).

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
