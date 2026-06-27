# Wavvon Web

The browser client for [Wavvon](https://github.com/Wavvon/Wavvon) — an
open-source, federated voice + text platform where communities run
their own servers and **your identity is a keypair, not an account**.
Nothing to install: the web client runs entirely in the browser, talks
to any Wavvon hub over plain HTTP + WebSocket, and keeps your identity
local (Web Crypto Ed25519 keys stored in IndexedDB — never sent to any
server).

It is a deliberate **feature subset** of the desktop client: text chat,
forums, E2E DMs, screen-share viewing, and admin tooling all work in
the browser; live voice needs the
[desktop app](https://github.com/Wavvon/Wavvon-desktop) (browsers can't
speak the hub's UDP voice protocol).

![Creating an identity and joining a hub from the browser - no signup, no install](https://raw.githubusercontent.com/Wavvon/Wavvon/main/assets/join-flow.gif)

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
  `.wavvonskin` files; localized UI; keyboard navigation and
  screen-reader support.
- **Self-hostable** — the production build is a static bundle; serve
  `dist/` from any web server or CDN. Tagged releases are also
  auto-deployed to GitHub Pages from CI.

This app lives in the [Wavvon-client](https://github.com/Wavvon/Wavvon-client)
monorepo at `apps/web`. Run pnpm commands from the **repo root**, not
from this directory.

## Quick start

Requires [Node 20+](https://nodejs.org) and
[pnpm 11+](https://pnpm.io). From the monorepo root:

```bash
pnpm install                       # installs the whole workspace, once
pnpm --filter wavvon-web run dev   # → http://localhost:1421
```

Click **Add hub** and enter a hub URL (`http://localhost:3000` for a
local dev hub — see [Wavvon-server](https://github.com/Wavvon/Wavvon-server)
to run one in 2 minutes).

## Building & checks

From the repo root:

```bash
pnpm --filter wavvon-web run build       # static bundle in apps/web/dist/
pnpm --filter wavvon-web run typecheck   # tsc --noEmit
pnpm --filter wavvon-web run test        # vitest
```

The production build is a static bundle — serve `apps/web/dist/` from
any web server or CDN, or let a hub self-serve it via
`WAVVON_WEB_CLIENT_DIR`.

## Where things live

| Path | What it is |
|---|---|
| `apps/web/` *(this dir)* | The React client (Vite) |
| `packages/i18n/` | `@wavvon/i18n` — shared locale strings + ICU machinery |
| `packages/utils/` | `@wavvon/utils` — shared utilities |
| `packages/core/` | `@wavvon/core` — shared platform-agnostic TS |

## The Wavvon project

| Repo | What it is |
|---|---|
| [Wavvon-client](https://github.com/Wavvon/Wavvon-client) | All clients (desktop / web / Android) + shared packages — **web is here, in `apps/web`** |
| [Wavvon-server](https://github.com/Wavvon/Wavvon-server) | Hub server, farm tooling, identity crate (Rust) |
| [Wavvon-discovery](https://github.com/Wavvon/Wavvon-discovery) | Optional public hub directory |
| [Wavvon](https://github.com/Wavvon/Wavvon) | Architecture wiki, roadmap, API spec |

New here? Start with
[getting-started.md](https://github.com/Wavvon/Wavvon/blob/main/docs/getting-started.md);
the browser client's design rationale is in
[browser-client.md](https://github.com/Wavvon/Wavvon/blob/main/docs/browser-client.md).

## License

[GNU Affero General Public License v3.0](../../LICENSE).

## Built with AI assistance

This project was built with substantial help from
[Claude](https://claude.ai) (Anthropic's AI assistant). The product
owner directs architecture, features, and tradeoffs; Claude drafts
most of the code, tests, and documentation, which is then reviewed,
adjusted, and accepted.

Calling this out for transparency — it's not a fully hand-written
codebase, and pretending otherwise wouldn't be honest.
