# Wavvon Web

The browser client for [Wavvon](https://github.com/Wavvon/Wavvon-docs) — an
open-source, federated voice + text platform where communities run
their own servers and **your identity is a keypair, not an account**.
Nothing to install: the web client runs entirely in the browser, talks
to any Wavvon hub over plain HTTP + WebSocket, and keeps your identity
local (Web Crypto Ed25519 keys stored in IndexedDB — never sent to any
server).

The full experience, in a tab: text chat, forums, E2E DMs, admin
tooling, and live voice over the hub's WebSocket audio relay — plus
webcam video and screen share via WebRTC.

![Creating an identity and joining a hub from the browser - no signup, no install](https://raw.githubusercontent.com/Wavvon/Wavvon-docs/main/assets/join-flow.gif)

## Features

- **Zero install, zero account** — open the page, an Ed25519 identity
  is generated on your device with a 24-word recovery phrase.
- **Full text experience** — channels with markdown, attachments and
  uploads, reactions, replies and threads, pins, polls, events, forum
  channels, custom emojis, search, drafts, typing indicators, unread
  tracking.
- **Live voice in the browser** — join voice channels over the hub's
  WebSocket audio relay: push-to-talk, per-participant volume, whisper,
  soundboard, plus webcam video and screen share via WebRTC.
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

This app lives in the [Wavvon-clients](https://github.com/Wavvon/Wavvon-clients)
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
pnpm --filter wavvon-web run build            # user build   → apps/web/dist/
pnpm --filter wavvon-web run build:hub        # hub build    → apps/web/dist-hub/
pnpm --filter wavvon-web run check-hub-build  # needs both of the above
pnpm --filter wavvon-web run typecheck        # tsc --noEmit
pnpm --filter wavvon-web run test             # vitest
```

One codebase, two targets. The **user build** is the multi-hub client:
add a hub, browse the directory, keep a home-hub list. The **hub build**
(`VITE_BUILD_TARGET=hub`, from `.env.hub`) is that client minus every
entry point that implies a second hub — it talks to the one hub that
served it, and cross-hub features that route through that hub (alliance
channels, forum, alliance voice) all still work.

A hub self-serving the client via `WAVVON_WEB_CLIENT_DIR` wants
`dist-hub/`; a general web server or CDN hosting the client for users
wants `dist/`. `check-hub-build` proves each build actually drops the
other's screens rather than hiding them — it reads the emitted bundles,
so run both builds first.

## Where things live

| Path | What it is |
|---|---|
| `apps/web/` *(this dir)* | The React client (Vite) |
| `packages/i18n/` | `@wavvon/i18n` — shared locale strings + ICU machinery |
| `packages/core/` | `@wavvon/core` — shared platform-agnostic TS |
| `packages/ui/` | `@wavvon/ui` — the shared components and the canonical stylesheet |

## The Wavvon project

| Repo | What it is |
|---|---|
| [Wavvon-clients](https://github.com/Wavvon/Wavvon-clients) | All clients (desktop / web) + shared packages — **web is here, in `apps/web`** |
| [Wavvon-server](https://github.com/Wavvon/Wavvon-server) | Hub server, farm tooling, identity crate (Rust) |
| [Wavvon-discovery](https://github.com/Wavvon/Wavvon-discovery) | Optional public hub directory |
| [Wavvon-docs](https://github.com/Wavvon/Wavvon-docs) | Architecture wiki, roadmap, API spec |

New here? Start with
[getting-started.md](https://github.com/Wavvon/Wavvon-docs/blob/main/docs/getting-started.md);
the browser client's design rationale is in
[browser-client.md](https://github.com/Wavvon/Wavvon-docs/blob/main/docs/browser-client.md).

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
