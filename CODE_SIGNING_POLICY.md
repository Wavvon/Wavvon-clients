# Code Signing Policy

Free code signing provided by [SignPath.io](https://about.signpath.io),
certificate by [SignPath Foundation](https://signpath.org).

## Scope

This policy applies to the **Voxply desktop client** (Voxply-desktop) and
its release artifacts — the Windows NSIS installer (`.exe`) and any bundled
binaries it contains.

## Team

| Role | Member |
|---|---|
| Author / Committer | [@papaa](https://github.com/papaa) |
| Reviewer | [@papaa](https://github.com/papaa) |
| Approver | [@papaa](https://github.com/papaa) |

Code is developed under the
[Voxply GitHub organisation](https://github.com/Voxply). All source
repositories are public. The same person who authors code is responsible for
approving signing of release artifacts.

## Build pipeline

Releases are built and signed exclusively via GitHub Actions
(`.github/workflows/release.yml`). Signing is triggered by a `v*` tag push.
No manual local signing is performed. The workflow is public and auditable in
the Voxply-desktop repository.

## What is signed

- The NSIS installer (`voxply-setup.exe`) produced by `tauri build`.
- The inner `voxply.exe` binary before it is packed into the installer.

No other artifacts are signed under this policy.

## Privacy

Voxply is a decentralised platform. The desktop client:

- Does **not** collect telemetry or usage data.
- Does **not** phone home to any Voxply-operated server on its own. All
  network traffic is initiated by the user (connecting to a hub of their
  choice, or to the project-operated discovery service).
- Stores all user data locally (`~/.voxply/`) or on hubs the user explicitly
  joins.

No personal information is transmitted without the user's direct action.
Full design rationale is in the [threat model](https://github.com/Voxply/Voxply/blob/main/docs/docs/threat-model.md).

## Third-party components

The installer bundles the following components that may be subject to their
own privacy policies. None of them collect data independently:

- **Opus** — open-source audio codec (BSD licence).
- **RNNoise** — open-source noise suppression (BSD licence).
- **WebKit / WKWebView** — bundled by Tauri as the UI renderer.

## Licence

Voxply is published under the
[GNU Affero General Public License v3.0](https://github.com/Voxply/Voxply-desktop/blob/main/LICENSE).
