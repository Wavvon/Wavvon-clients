# Changelog

All notable changes to Wavvon Desktop are documented here.

## [0.3.1] — 2026-07-06
### Bug Fixes
- Drop hardcoded pnpm version 9 — use packageManager field
- Cargo fmt — reformat voice_cmd.rs
- Resolve three build check failures
- I18n keys showing raw, context menu clicks unresponsive, whisper/screen-share issues
- Wrap app in I18nextProvider to fix dual-instance split
- Resolve all remaining W5-W24 audit findings
- Resolve Android Rollup import failure and macOS xcap compile error
- Replace xcap 0.9.6 with 0.3.3 to fix macOS E0282 without breaking Ubuntu 22.04
- Pre-bundle opusscript so Vite converts CJS to ESM
- Parse invite URL in WelcomeScreen before calling addHub
- Use opusscript asm.js backend in browser
- Use valid ScriptProcessor buffer size and accumulate Opus frames
- Always show welcome screen when no hubs are connected
- Wire channel context menu, toast/error, and missing WS events
- Add Banner and Category types to create channel modal
- Refresh member list after saving display name in Settings
- Strip UTF-8 BOM introduced by bulk rename
- Align DR v2 signing tag with identity crate
- Align moderation command endpoints with server route registrations
- Validate hub-supplied role/category color before CSS background
- Newly-joined members appear in the member list live

### Documentation
- Fix renamed GitHub URLs and outdated voice claims in READMEs

### Features
- Wire screen-share viewing — binary WS support + active stream state (W8)
- D5b composer + menu, D3/D9 voice icons, D6 voice switching, D2 camera picker, D4 screen-share scroll
- Draggable/resizable PiP self-view; move bg effects to settings
- Show "Hosted by" server link in hub preview cards
- Implement Create channel/category modal
- Add channel edit and delete
- Bot mini-app launch cards and webview/iframe support (M5/M6/M7)
- M8 — plumb requires_camera through all three clients
- Client-side passkey flows (web + desktop)
- Passkey login button in AddHubModal (web)
- Double Ratchet v2 TypeScript implementation
- Double Ratchet v2 session state and Tauri commands
- Wire Double Ratchet v2 into DM send and receive
- Per-participant voice volume control for web and android
- Voice audio quality profiles in shared UI and web/android
- V3 proximity voice — zone tracking and attenuation gain
- Forum reactions, attachment UI shell, and Playwright E2E setup
- Implement ME1/ME2/ME3 moderation UI
- Outgoing webhooks admin UI
- Channel permalinks and breadcrumbs
- Capped indent and drill-in for deep channel nesting
- Role categories and role color/icon appearance
- Join-to-create temporary voice channel UI
- Assign/remove roles from the member right-click menu
- Role create/delete/permissions UI; network timeouts + error surfacing
- Outbound screen share + avatar image upload
- Friends feature (add / accept / list / remove)
- Admin cluster + mic meter (desktop parity)
- My certifications viewer (Settings > Account)
- Camera video (full-mesh WebRTC over the hub WS)
- Whisper (targeted voice) — control + audio
- Alliance channel-sharing
- Channel appearance (color + icon) editing
- Focused-window push-to-talk
- Multi-profile (named display-name/avatar presets)
- Onboarding survey builder + member survey

### Refactoring
- Extract channel-message, alliance, and WS hooks from App.tsx (desktop + android)

### Tests
- Add live Playwright e2e suite for the 2026-07-04 feature batch
- E2e for profile/presence/channel-CRUD/roles; fix i18n placeholders


## [0.2.4] — 2026-06-12
### Bug Fixes
- MacOS bundle value is app, not macos (unreachable until the libopus fix)


## [0.2.3] — 2026-06-12
### Bug Fixes
- Online status dot, voice icon, real-time voice list, channel gap, forum badge, status picker
- Sidebar overflow hidden + user-identity flex-shrink:0 so identity bar is always visible
- Emoji disappear in message input on Windows (IME composition events)
- Reactions disappear on hover, picker off-screen near top of viewport
- Reaction picker stays open on mouse-out, no h-scroll, recents clipped
- Emoji picker 8 columns always visible (wider popup + scrollbar-gutter)
- Thin 4px scrollbar on emoji grid so all 8 columns stay visible
- Global thin scrollbar; picker uses position:fixed to never clip under header
- Stable keys for DM message list rendering
- Stable keys for PollComposer option list
- Add aria-label to icon-only buttons (desktop)
- Associate settings selects with their labels (desktop)
- Associate admin form labels with their controls (desktop)
- Fetch identity key after adding first hub (desktop)
- Block DM send on encryption failure instead of falling back to plaintext
- Address safety, perf, and CI hardening issues
- Subscribe to voice-roster-update, the event the backend actually emits
- Correct bundle output paths and add fail_on_unmatched_files in release workflow
- Replace panics in spawned audio tasks with recoverable errors
- Add noEmit to tsconfig — bare tsc in the build script emitted stale .js beside sources, shadowing .tsx in vite builds
- Dedupe react in vite config — file: deps from ../../web pulled a second React copy into production bundles, crashing packaged builds at startup
- Release pipeline updater artifacts + macOS opus path; bump to 0.2.2

### Documentation
- Add CONTRIBUTING.md
- Rewrite README as a download-first landing page
- Restore the AI-assistance transparency note

### Features
- Forum channel type in create modal, simplified context menu, full i18n
- Picture-in-picture button for screen share viewer
- Screen share audio output device routing via setSinkId
- Multi-stream overlay — render N concurrent sharers as independent panels
- Hub Streams panel — subscribe to streams from other channels
- Desktop auto-updater with user-confirmation banner
- Networked voice Phase 1 client — VXRG/VXRA UDP registration

### Refactoring
- Replace local util modules with shared @voxply/utils package
- Split 9,844-line lib.rs into 28 domain modules
- Extract DM cluster into useDms hook

### Tests
- Add vitest and unit tests for format and channel-tree utils
- Add unit tests for svgSanitize covering XSS vectors and size limit
- Pin identity wire encoders to canonical hub vectors
- Pin DhKeyRecord and DM-envelope wire vectors


## [0.2.0] — 2026-06-02
### Bug Fixes
- Install i18n deps before tsc so module resolution works in CI
- Add .npmrc with legacy-peer-deps for TypeScript 6 / i18next peer conflict
- Install Linux system libs (GTK3/GDK + Tauri deps) before cargo check
- Resolve i18n module resolution via tsconfig paths, not npm install
- Remove deprecated baseUrl from tsconfig (TypeScript 6 paths work without it)
- Add libasound2-dev for ALSA (voice crate)
- Bump @tauri-apps/api and cli to 2.11 to match resolved Rust crate
- Pin i18next aliases in Vite for desktop (same fix as web)
- Add intl-messageformat explicitly (peer dep of i18next-icu missing from lock)
- Install opus on macOS and libopus-dev on Linux for voice crate
- Set PKG_CONFIG_PATH for Homebrew opus so audiopus_sys finds it
- Install autotools + set OPUS_DIR for audiopus_sys macOS build
- Build arm64 DMG only (audiopus_sys cannot cross-compile for universal)

### Features
- Nested channels DnD, forum channels, multi-device devices tab, server tags/badges, games admin, expanded game SDK, Tier 2 session picker, hub certifications, identity backup/recovery contacts, block/ignore/DND, WebRTC screen share



