export interface HubInputResult {
  hubUrl: string;
  inviteCode: string;
  /**
   * Stable hub identifier (its public key) carried by farm-ready invite links
   * of the form `.../i/<hubSerial>/<inviteCode>`. When present the client can
   * verify it connected to the intended hub (and, in a farm, the same domain
   * can route to different hubs by serial). Empty for legacy host-only links.
   */
  hubSerial?: string;
  target?:
    | { kind: "channel"; channelId: string }
    | { kind: "message"; channelId: string; messageId: string };
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
 * Build a farm-ready invite link: `wavvon://<host>/i/<hubSerial>/<inviteCode>`.
 * The host is the connection target (a hub host today, a farm domain later),
 * the serial identifies which hub, and the code is the join credential.
 * Round-trips through parseHubInput.
 */
export function buildInviteLink(hubUrl: string, hubSerial: string, inviteCode: string): string {
  let host = hubUrl.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  host = host.replace(/^wavvon:\/\//i, "");
  return `wavvon://${host}/i/${hubSerial}/${inviteCode}`;
}

export function parseHubInput(raw: string): HubInputResult | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // wavvon:// deep link: wavvon://host[:port]/[inviteCode][?params]
  if (trimmed.startsWith("wavvon://")) {
    const rest = trimmed.slice("wavvon://".length);
    const slashIdx = rest.indexOf("/");
    const hostPart = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
    const codePart =
      slashIdx === -1 ? "" : rest.slice(slashIdx + 1).split("?")[0];
    if (!hostPart) return null;
    const isLocal =
      hostPart.startsWith("localhost") || hostPart.startsWith("127.");
    const hubUrl = `${isLocal ? "http" : "https"}://${hostPart}`;
    // Farm-ready invite: wavvon://host/i/<hubSerial>/<inviteCode>
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
      const hubUrl = `${url.protocol}//${url.host}`;
      // Farm-ready invite path: https://host/i/<hubSerial>/<inviteCode>
      const invite = parseInvitePath(url.pathname.replace(/^\/+/, ""));
      if (invite) {
        return { hubUrl, inviteCode: invite.inviteCode, hubSerial: invite.hubSerial };
      }
      // Browser-facing invite path: https://host/join/<inviteCode>
      const joinCode = parseJoinPath(url.pathname.replace(/^\/+/, ""));
      if (joinCode) {
        return { hubUrl, inviteCode: joinCode };
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
