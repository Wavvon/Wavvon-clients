---
name: wire-format-change
description: Checklist for changing a signed envelope or the backup format — the four implementations that must match byte-for-byte, the version-tag rule, and what "done" means. Use whenever touching packages/core/src/identity, apps/desktop/src-tauri/src/identity.rs, signing bytes, or the .wavvon-backup format.
---

# Changing a wire format

The signing bytes of every Wavvon envelope exist in **four places** that must
agree byte-for-byte. The authority is in a different repository from this one.
Getting this wrong doesn't produce a compile error — it produces signatures one
side rejects, in production, on someone else's hub.

| Where | Repo | File |
|---|---|---|
| **Authority** | Wavvon-server | `crates/identity/src/` |
| **Vectors (data)** | Wavvon-server | `crates/identity/wire-vectors.json`, asserted by `tests/wire_vectors.rs` |
| Vendored vectors | Wavvon-clients (here) | `wire-vectors/wire-vectors.json` + `wire-vectors/SOURCE` (the server commit) |
| TypeScript mirror | Wavvon-clients (here) | `packages/core/src/identity/wire.ts` (+ `crypto.ts`, `voice.ts`); tests `wire.test.ts`, `crypto.test.ts`, `voice.test.ts` via `wireVectors.ts` |
| Desktop Rust mirror | Wavvon-clients (here) | `apps/desktop/src-tauri/src/identity.rs` (`mod wire_vector_tests`), `voice_keys.rs`, `crates/voice/src/crypto.rs`; loader `src-tauri/src/wire_vectors.rs` |
| Human-readable spec | Wavvon-docs | `docs/wire-format.md` |

**The code in this repo is a mirror, not an implementation.** It exists to
match the Rust authority, and the way you verify that is by asserting the same
test vectors — not by reading the Rust and re-deriving the logic.

**The vectors are data, and this repo holds a byte-identical copy.** Every
expected output a mirror test asserts is read from
`wire-vectors/wire-vectors.json`; none is spelled out in a test file. The copy
is refreshed only by `node scripts/sync-wire-vectors.mjs [ref]` (default
`develop`), which downloads the server's file and records the resolved commit
in `wire-vectors/SOURCE`. Never edit the JSON by hand:
`scripts/check-wire-vectors.mjs` runs in CI and fails unless the copy matches
the server at `SOURCE` byte for byte.

The `.wavvon-backup` format follows the same discipline:
`packages/core/src/identity/backup.ts`, `apps/desktop/src-tauri/src/backup.rs`
and the server's backup logic all assert one fixed vector.

## The rule that makes this safe

**Never change the layout under an existing version tag.** The tag
(`wavvon/<name>/v1\0`) is part of the signing bytes. A changed layout needs a
**new tag** — `wavvon/subkey-cert/v2\0` — so an old verifier rejects the new
format cleanly instead of computing a different hash over the same bytes and
reporting "invalid signature" for a reason nobody can find.

Deployments are **not** synchronized. Every hub serves its own baked-in copy of
the web client, and that copy talks to other hubs — the client served by hub A
is talking to hubs B and C. So at any moment there are old verifiers and new
signers in the same network. A new version must be introduced additively: emit
the old version until the floor moves, accept both.

## Order of operations

The change starts in the server repo, even when the symptom showed up here.

1. **Decide whether this needs a new version tag at all.** Adding a field to an existing layout does. Adding a new envelope type doesn't touch existing ones.
2. **Change the authority** — Wavvon-server `crates/identity/src/` — and add vectors to `crates/identity/wire-vectors.json`, keeping the old ones. Land it on the server's `develop` first: the clients sync from a commit.
3. **Update the spec** in Wavvon-docs `docs/wire-format.md` (envelope layout + fixed inputs). That's what you implement the mirrors *against*.
4. **Mirror here, both sides:** `packages/core/src/identity/wire.ts` and `apps/desktop/src-tauri/src/identity.rs`. Run `node scripts/sync-wire-vectors.mjs [ref]` to vendor the new JSON, then make `wire.test.ts` and `mod wire_vector_tests` assert any new vector by computing it from the JSON inputs. Never paste expected hex into a test file.
5. **Gate on capability, never on version.** If the client must know whether a hub speaks the new format, ask `hubSupports(hubId, cap)` / `activeHubSupports(cap)` and treat unknown as false. The capability string is added on the server side in the same change.
6. **Run every vector suite**: `cd packages/core && pnpm test`, `cargo test --workspace` (desktop shell + `crates/voice`), `node scripts/check-wire-vectors.mjs`, and `cargo test -p wavvon-identity` in the server repo.
7. `pnpm typecheck` from the repo root — a changed wire type ripples into callers.

## What "done" means

All vector suites green on both sides, the spec updated, and the capability
gate in place if the change is observable to a client. A change that compiles
here and hasn't been mirrored on the other side is **not** done, and saying
which mirrors are outstanding out loud is part of the deliverable, not a
footnote.

If you cannot reach the server repo (not checked out, no permission), stop and
say exactly which pieces are outstanding and which files they live in. Do not
"fix" a mirror mismatch by editing the mirror to match itself.

> This checklist is duplicated in Wavvon-server as the same skill, on purpose:
> each repo has to be usable alone. If you change one, change both.
