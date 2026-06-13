# Voxply Android

The Android client for [Voxply](https://github.com/Voxply/Voxply) — an
open-source, federated voice + text platform where communities run
their own servers and **your identity is a keypair, not an account**.
A mobile-first UI packaged as a native APK with Tauri 2, speaking the
same hub API as every other Voxply client. Distributed as a direct APK
— no app store, no store account, no middleman.

Like the browser client it is a deliberate **feature subset**: full
text chat, forums, and DMs on the go; live voice is desktop-only for
now (see
[android-client.md](https://github.com/Voxply/Voxply/blob/main/docs/android-client.md)
for the rationale).

## Features

- **No account, no phone number** — an Ed25519 identity generated on
  your device, with a 24-word recovery phrase and QR multi-device
  pairing so your phone shares the identity of your desktop.
- **Full text experience** — channels with markdown, attachments,
  reactions, replies and threads, polls, events, forum channels,
  custom emojis, search, drafts, unread tracking.
- **E2E-encrypted DMs** — encrypted on-device; hubs relay ciphertext
  only.
- **Themes & custom skins**, localized UI, screen-reader support.
- **No telemetry.** The app talks only to the hubs you add.

## Install

APKs are built and signed by the public
[CI workflow](https://github.com/Voxply/Voxply-android/actions/workflows/build.yml)
on every push to `main` — download the `android-apk` artifact from the
latest successful run, or build from source below.

Installing outside an app store requires allowing "unknown sources" and
dismissing a Play Protect prompt — the step-by-step end-user guide is in
[install-android.md](https://github.com/Voxply/Voxply/blob/main/docs/install-android.md).

The Android client lives in the
[Voxply-client](https://github.com/Voxply/Voxply-client) monorepo at
`apps/android`. It is two Tauri 2 wrappers — one around the desktop UI
(`voxply-desktop/`) and one around the web UI (`voxply-web/`) — sharing
the Rust `voice` crate from the monorepo root. JS dependencies and the
`@voxply/*` packages are resolved by the workspace, so run `pnpm install`
once from the **repo root**.

## Build from source

Requires [Node 20+](https://nodejs.org),
[pnpm 11+](https://pnpm.io), Rust, and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) including
the Android SDK + NDK.

```bash
# from the monorepo root
pnpm install

# generate the Android project, then run on a device/emulator
cd apps/android/android
npx tauri android init
npx tauri android dev
```

### Release APK

```bash
cd apps/android/android
npx tauri android build --target aarch64 --target armv7
# Output: apps/android/android/src-tauri/gen/android/app/build/outputs/apk/
```

See [`android/SIGNING.md`](android/SIGNING.md) for keystore
configuration. CI signs APKs when the `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, and `ANDROID_KEY_PASSWORD` repository
secrets are set.

## Layout (under `apps/android/`)

| Path | What it is |
|---|---|
| `android/` | The Tauri 2 Android shell + project, signing config |
| `voxply-desktop/` | Android build of the desktop client UI |
| `voxply-web/` | Android build of the web client UI |

The Rust `voice` crate and the `@voxply/*` packages are shared from the
monorepo root, not vendored here.

## The Voxply project

| Repo | What it is |
|---|---|
| [Voxply-client](https://github.com/Voxply/Voxply-client) | All clients (desktop / web / Android) + shared packages — **Android is here, in `apps/android`** |
| [Voxply-server](https://github.com/Voxply/Voxply-server) | Hub server, farm tooling, identity crate (Rust) |
| [Voxply-discovery](https://github.com/Voxply/Voxply-discovery) | Optional public hub directory |
| [Voxply](https://github.com/Voxply/Voxply) | Architecture wiki, roadmap, API spec |

New here? Start with
[getting-started.md](https://github.com/Voxply/Voxply/blob/main/docs/getting-started.md).

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
