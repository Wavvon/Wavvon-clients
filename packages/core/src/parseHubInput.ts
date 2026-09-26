export interface HubInputResult {
  hubUrl: string;
  inviteCode: string;
  /**
   * Stable hub identifier (its public key) carried by invite links
   * of the form `.../i/<hubSerial>/<inviteCode>`. When present the client can
   * verify it connected to the intended hub (one host can serve several, so the same domain
   * can route to different hubs by serial). Empty for legacy host-only links.
   */
  hubSerial?: string;
  /**
   * SHA-256 hex fingerprint of a LAN hub's self-signed cert, carried
   * out-of-band in the invite URL's `?fp=` query param or `#fp=` hash
   * fragment (lan-mode.md §3/§5). Lets the client TOFU-verify the hub it
   * connected to is the one the invite was printed for. Undefined when
   * absent or malformed (not 64 hex chars) — callers then skip the check.
   */
  fingerprint?: string;
  target?:
    | { kind: "channel"; channelId: string }
    | { kind: "message"; channelId: string; messageId: string };
}

function extractFingerprint(url: URL): string | undefined {
  const fromQuery = url.searchParams.get("fp");
  const fromHash = new URLSearchParams(url.hash.replace(/^#/, "")).get("fp");
  const fp = (fromQuery ?? fromHash ?? "").toLowerCase();
  return /^[0-9a-f]{64}$/.test(fp) ? fp : undefined;
}

/**
 * Parse an `i/<hubSerial>/<inviteCode>` invite path tail. Returns null if the
 * tail isn't an invite (so callers fall back to legacy/permalink handling).
 */
function parseInvitePath(codePart: string): { hubSerial: string; inviteCode: string } | null {
  const segments = codePart.split("/").filter(Boolean);
  if (segments[0] !== "i" || !segments[1]) return null;
  return { hubSerial: segments[1], inviteCode: segments[2] ?? "" };
}

/**
 * Parse a `join/<inviteCode>` path tail — the browser-facing invite form the
 * hub prints alongside the wavvon:// link (`https://host/join/<code>`).
 * Pasting that link into Add-hub must carry the code too.
 */
function parseJoinPath(codePart: string): string | null {
  const segments = codePart.split("/").filter(Boolean);
  if (segments[0] !== "join" || !segments[1]) return null;
  return segments[1];
}

/**
 * Split a path-prefixed hub URL into the hub's base and the rest.
 *
 * One host can serve several hubs, each under a path — `https://host.example/hub/pippo` —
 * so its base URL is the origin plus that prefix, and everything after it is
 * the ordinary hub path. Without this, a link like
 * `https://host.example/hub/pippo/join/abc` parses to the host's root with no
 * invite code: the user gets added to nothing, or to the wrong thing.
 *
 * `/hub/<x>` is not guesswork — it is the one and only proxy route such a host exposes.
 */
function splitHubPathPrefix(pathname: string): { prefix: string; rest: string } {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "hub" && segments[1]) {
    return {
      prefix: `/hub/${segments[1]}`,
      rest: segments.slice(2).join("/"),
    };
  }
  return { prefix: "", rest: segments.join("/") };
}

/**
 * Parse a `channel/{id}` or `channel/{id}/message/{id}` path tail (the part
 * of a wavvon:// deep link after the host) into a permalink target.
 * Anything else — including an empty path — is not a permalink and is left
 * for the caller to treat as an invite code, preserving backward
 * compatibility with existing wavvon:// invite links.
 */
function parseDeepLinkTarget(codePart: string): HubInputResult["target"] {
  const segments = codePart.split("/").filter(Boolean);
  if (segments[0] !== "channel" || !segments[1]) return undefined;
  const channelId = segments[1];
  if (segments.length === 2) return { kind: "channel", channelId };
  if (segments[2] === "message" && segments[3]) {
    return { kind: "message", channelId, messageId: segments[3] };
  }
  return undefined;
}

/**
 * Parse any hub address the user can provide into a normalised hubUrl + inviteCode pair.
 *
 * Accepted forms:
 *   wavvon://host[:port]/[inviteCode][?params]  — deep link (desktop / mobile)
 *   wavvon://host[:port]/channel/{id}[?params]                — channel permalink
 *   wavvon://host[:port]/channel/{id}/message/{id}[?params]   — message permalink
 *   https://host[?invite=code]                 — HTTPS URL, optional invite param
 *   https://host[#invite=code]                 — HTTPS URL, invite in hash fragment
 *   host[:port]                                — bare hostname, normalised to https://
 *
 * Returns null for empty / unparseable input.
 */
/**
 * Build the invite link users copy/share: the plain browser form
 * `http(s)://<base>/join/<inviteCode>` (UX decision 2026-07-25 — the
 * wavvon://…/i/<serial>/<code> deep link is too long to hand around; it
 * remains accepted by parseHubInput for old links).
 * Round-trips through parseHubInput.
 *
 * `hubUrl` is a base, not a bare host: a hub sharing a host with others lives under
 * `https://host.example/hub/MangiaDaPippo`, and appending `/join/<code>` to
 * that is already the right link. It used to take a separate `hubSerial` for
 * a serial-routed form that this never built — the address the client holds
 * carries the routing now, so the argument is gone rather than ignored.
 */
export function buildInviteLink(hubUrl: string, inviteCode: string): string {
  let host = hubUrl.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  host = host.replace(/^wavvon:\/\//i, "");
  const isLocal = host.startsWith("localhost") || host.startsWith("127.");
  return `${isLocal ? "http" : "https"}://${host}/join/${inviteCode}`;
}

export function parseHubInput(raw: string): HubInputResult | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // wavvon:// deep link: wavvon://host[:port][/hub/<slug>]/[inviteCode][?params]
  if (trimmed.startsWith("wavvon://")) {
    const rest = trimmed.slice("wavvon://".length);
    const slashIdx = rest.indexOf("/");
    const hostPart = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
    const pathPart =
      slashIdx === -1 ? "" : rest.slice(slashIdx + 1).split("?")[0];
    if (!hostPart) return null;
    const isLocal =
      hostPart.startsWith("localhost") || hostPart.startsWith("127.");
    // Same `/hub/<slug>` split as the http(s) branch below. Without it the
    // client could not read the links it writes itself: a channel permalink
    // for a path-hosted hub is `wavvon://host/hub/<pubkey>/channel/<id>`
    // (MessageRow.tsx / AppModals.tsx strip only the scheme), and taking the
    // host alone resolved it to the *farm root* with the whole prefix left
    // sitting in the invite code.
    const { prefix, rest: codePart } = splitHubPathPrefix(`/${pathPart}`);
    const hubUrl = `${isLocal ? "http" : "https"}://${hostPart}${prefix}`;
    // Invite carrying the hub's serial: wavvon://host/i/<hubSerial>/<inviteCode>
    const invite = parseInvitePath(codePart);
    if (invite) {
      return { hubUrl, inviteCode: invite.inviteCode, hubSerial: invite.hubSerial };
    }
    const joinCode = parseJoinPath(codePart);
    if (joinCode) {
      return { hubUrl, inviteCode: joinCode };
    }
    const target = parseDeepLinkTarget(codePart);
    return {
      hubUrl,
      inviteCode: target ? "" : codePart,
      ...(target ? { target } : {}),
    };
  }

  // HTTP(S) URL — may carry ?invite= or #invite= for browser-based invites
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      // A path-hosted hub's base URL includes its /hub/<slug> prefix; for a
      // standalone hub the prefix is empty and this is just the origin.
      const { prefix, rest } = splitHubPathPrefix(url.pathname);
      const hubUrl = `${url.protocol}//${url.host}${prefix}`;
      const fingerprint = extractFingerprint(url);
      // Serial-carrying invite path: https://host/i/<hubSerial>/<inviteCode>
      const invite = parseInvitePath(rest);
      if (invite) {
        return {
          hubUrl,
          inviteCode: invite.inviteCode,
          hubSerial: invite.hubSerial,
          ...(fingerprint ? { fingerprint } : {}),
        };
      }
      // Browser-facing invite path: https://host[/hub/<slug>]/join/<inviteCode>
      const joinCode = parseJoinPath(rest);
      if (joinCode) {
        return { hubUrl, inviteCode: joinCode, ...(fingerprint ? { fingerprint } : {}) };
      }
      const fromQuery = url.searchParams.get("invite") ?? "";
      const fromHash = url.hash.startsWith("#invite=")
        ? url.hash.slice("#invite=".length)
        : "";
      const hubSerial = url.searchParams.get("hub") ?? "";
      return {
        hubUrl,
        inviteCode: fromQuery || fromHash,
        ...(hubSerial ? { hubSerial } : {}),
        ...(fingerprint ? { fingerprint } : {}),
      };
    } catch {
      return { hubUrl: trimmed, inviteCode: "" };
    }
  }

  // Plain hostname — normalise to https (http for localhost/loopback)
  const isLocal =
    trimmed.startsWith("localhost") || trimmed.startsWith("127.");
  return {
    hubUrl: `${isLocal ? "http" : "https"}://${trimmed}`,
    inviteCode: "",
  };
}

/**
 * The invite code carried by the page's own path.
 *
 * A hub serves its web client at `/join/<code>` as well as at `/`, because
 * that URL is the link an operator hands out — before this the hub answered it
 * with JSON and a new user's first sight of Wavvon was `{"code":…}` on a white
 * page. Serving the app there is only half the fix: the app has to notice the
 * code is in its own address, which is what this reads.
 *
 * Returns null for any other path, so a normal page load is unaffected.
 */
export function inviteCodeFromPath(pathname: string): string | null {
  const match = /^\/join\/([A-Za-z0-9_-]+)\/?$/.exec(pathname);
  return match ? match[1] : null;
}
