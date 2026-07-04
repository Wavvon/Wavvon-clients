# Live e2e tests

Unlike the mock-API specs in `e2e/*.spec.ts`, everything under `e2e/live/`
runs against a **real hub** on `http://localhost:3000`. The `live-setup`
project onboards a deterministic owner identity once and saves the session
to `e2e/.auth/owner.json`; the `live` project reuses it.

## Launch recipe

```powershell
# 1. Postgres (from server/)
docker compose -f docker-compose.dev.yml up -d
docker exec server-postgres-1 psql -U postgres -c "CREATE DATABASE wavvon_e2e"

# 2. Migrate + run the hub (note: `migrate` reads unprefixed DATABASE_URL)
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/wavvon_e2e'
.\target\debug\wavvon-hub.exe migrate
$env:WAVVON_DATABASE_URL='postgres://postgres:postgres@localhost:5432/wavvon_e2e'
$env:WAVVON_OWNER_PUBKEY='03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8'
.\target\debug\wavvon-hub.exe

# 3. Run the tests (from clients/apps/web/) — vite is started by Playwright
npm run test:e2e:live
```

The owner pubkey above is derived from the fixed seed in
`helpers/live.ts` (`000102…1e1f`); seeding it as `WAVVON_OWNER_PUBKEY`
makes the recovered identity the hub owner, which the admin-surface
tests (roles, permissions, soundboard) require.

Tests create uniquely-named channels/roles per run, so a persistent
`wavvon_e2e` database is fine; drop and recreate it for a fully clean
slate. Run with `--workers=1` (the `test:e2e:live` script does) — specs
share one hub and are not isolated from each other.
