# Voxply-desktop

Desktop client for the [Voxply](https://github.com/Voxply/Voxply) platform.
Voice chat, text channels, direct messages, alliances, bots, screen share —
all running as a native desktop app backed by a Tauri Rust layer.

Part of the Voxply project — see the
[docs repo](https://github.com/Voxply/Voxply) for architecture,
API spec, and roadmap.

## Technologies

- **Tauri 2** — native desktop wrapper (Rust shell + system WebView)
- **React 18** + **TypeScript** — UI layer
- **Vite** — build tooling and dev server
- **Rust** (src-tauri) — native commands: identity, E2E crypto, voice, HTTP
- **ed25519-dalek** — Ed25519 keypair generation and signing
- **BIP39** — 24-word recovery phrase
- **voxply-voice** — audio pipeline: cpal capture, Opus codec, RNNoise denoise
- **AES-GCM + HKDF** — end-to-end encrypted direct messages
- **WebSocket** — real-time hub events

## Quick start

Requires [Node 20+](https://nodejs.org) and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
cd voxply-desktop
npm install
npm run tauri dev
```

The window opens with an "Add a hub" prompt. Paste a hub URL
(`http://localhost:3000` for a local dev hub) to connect.

## Building a release

```bash
cd voxply-desktop
npm run tauri build
# Output: src-tauri/target/release/bundle/
```

## Type checking

```bash
cd voxply-desktop
npx tsc --noEmit    # TypeScript check
cargo check --workspace   # Rust check
```

## Built with AI assistance

This project was built with substantial help from
[Claude](https://claude.ai) (Anthropic's AI assistant). The product
owner directs architecture, features, and tradeoffs; Claude drafts
most of the code, tests, and documentation, which is then reviewed,
adjusted, and accepted.

Calling this out for transparency — it's not a fully hand-written
codebase, and pretending otherwise wouldn't be honest.

## License

[GNU Affero General Public License v3.0](LICENSE).
