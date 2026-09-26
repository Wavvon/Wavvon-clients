# Live e2e tests

> **Where it points is configurable.** `WAVVON_E2E_HUB_URL` overrides the hub
> (default `http://localhost:3000`) and `WAVVON_E2E_APP_URL` the app origin
> (default `http://localhost:1421`). Both were consts until 2026-08-22, which
> is the entire reason this suite only ever ran on a laptop where someone had
> started a hub by hand. `.github/workflows/e2e-live.yml` uses them to run the
> suite against a hub it builds and starts itself, and the same override points
> the suite at a farm-hosted `/hub/<slug>`.
>
> Two things to know if you drive a **genuinely fresh** hub, because neither is
> visible on a dev box that already has state. Run the hub API-only with
> `WAVVON_WEB_CLIENT_DIR=` (empty) so Playwright serves the client under test
> rather than whatever the hub baked in — that needs a hub built after
> 2026-08-22, when an empty value started meaning "unset" instead of "a
> directory called `''`". And a hub with no channels greets its owner with the
> first-boot template picker, whose overlay swallows every click behind it;
> `onboardWithSeed` dismisses it, so the flag lands in the saved owner session.

Unlike the mock-API specs in `e2e/*.spec.ts`, everything under `e2e/live/`
runs against a **real hub** on `http://localhost:3000`. The `live-setup`
project onboards a deterministic owner identity once and saves the session
to `e2e/.auth/owner.json`; the `live` project reuses it.

## Launch recipe

The suite wants a hub with an empty database, and the shortest way to one is
the hub's own bundled PostgreSQL: leave `WAVVON_DATABASE_URL` unset and the
hub installs and starts a server under its working directory. A new directory
is therefore a new hub with a new identity and an empty database, and deleting
it is the whole cleanup.

```powershell
# 1. A throwaway hub, from an empty directory (no docker, no CREATE DATABASE)
$env:WAVVON_OWNER_PUBKEY='03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8'
$env:WAVVON_HTTP_PORT='3010'
$env:WAVVON_VOICE_UDP_PORT='3011'
C:\path\to\server\target\debug\wavvon-hub.exe

# 2. Run the tests (from clients/apps/web/) — vite is started by Playwright
$env:WAVVON_E2E_HUB_URL='http://localhost:3010'
npm run test:e2e:live
```

Against an external PostgreSQL instead, point `WAVVON_DATABASE_URL` at a
database created for the run (`migrate` reads the unprefixed `DATABASE_URL`),
and drop it afterwards:

```powershell
docker compose -f docker-compose.dev.yml up -d
docker exec server-postgres-1 psql -U postgres -c "CREATE DATABASE wavvon_e2e"
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/wavvon_e2e'
.\target\debug\wavvon-hub.exe migrate
$env:WAVVON_DATABASE_URL='postgres://postgres:postgres@localhost:5432/wavvon_e2e'
```

## Driving the hub build

The suite normally runs the **user** build behind Vite, which is a different
origin from the hub. Anything that only exists when the hub serves the client
itself — an invite link at `/join/<code>`, the locked hub address on the
welcome screen, passkeys — cannot be reached that way. Point both overrides at
a hub that serves `dist-hub` instead:

```powershell
npm run build:hub                       # from clients/apps/web
$env:WAVVON_WEB_CLIENT_DIR='C:path	oclientsappswebdist-hub'
# ...start the hub as above, then:
$env:WAVVON_E2E_HUB_URL='http://localhost:3010'
$env:WAVVON_E2E_APP_URL='http://localhost:3010'
npx playwright test --project=live --no-deps --workers=1 e2e/live/<spec>.spec.ts
```

`--no-deps` skips `live.setup.ts`, which drives the user build's welcome
screen and cannot onboard here — a spec run this way brings its own contexts.
The hub reads `index.html` once at startup, so **restart it after every
`build:hub`** or it serves an index pointing at asset files the rebuild
deleted.

**Locally Playwright serves the dev server; in CI it builds and previews.**
The dev server transforms each module on first request, and on a two-core
runner that put seconds in front of the first click on any menu or modal —
65 of 85 specs flaky there while every one of them stayed green locally.
`webServer` runs `npm run build && npm run preview` when `CI` is set for that
reason; locally the dev server stays, since nothing waits on it on a fast
machine.

The owner pubkey above is derived from the fixed seed in
`helpers/live.ts` (`000102…1e1f`); seeding it as `WAVVON_OWNER_PUBKEY`
makes the recovered identity the hub owner, which the admin-surface
tests (roles, permissions, soundboard) require.

Tests create uniquely-named channels/roles per run, but **a persistent
`wavvon_e2e` database is not actually fine** — this used to say it was. Unique
names stop collisions, they do not stop accumulation: a third run against a
database two runs had already filled failed four specs that had nothing to do
with each other and everything to do with a hub carrying hundreds of channels,
roles and members. Drop and recreate between runs. On a clean database the
suite is 85 passed, 1 skipped, 0 failed (2026-08-22).

The skip is `54-ttt-game`, which needs `TTT_BOT_PUBKEY` and a running
`server/crates/ttt-bot`. It skips silently, so a run reporting green has
covered 85 of 86 — the CI job included.

Two failure shapes worth recognising before chasing them as product bugs.
**The specs share one hub in file order**, so "element(s) not found" often means
an earlier spec changed the state this one assumed — P57 matched the owner's
display name against the seed constant, which P24 renames without putting back;
read the name from `/me` instead. And **the app reloads itself once per page
load** when the prefs pull brings back a boot-time setting (App.tsx
`PREFS_RELOAD_FLAG`), which closes menus and kills in-flight
`page.evaluate` calls; `expectInHub` and `onboardWithSeed` claim that flag
so it cannot fire mid-spec, and anything opening a page without them should do
the same.

Run with `--workers=1` (the `test:e2e:live` script does) — specs share one hub
and are not isolated from each other.
