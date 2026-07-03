export interface HubInputResult {
  hubUrl: string;
  inviteCode: string;
  target?:
    | { kind: "channel"; channelId: string }
    | { kind: "message"; channelId: string; messageId: string };
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
    const target = parseDeepLinkTarget(codePart);
    return {
      hubUrl: `${isLocal ? "http" : "https"}://${hostPart}`,
      inviteCode: target ? "" : codePart,
      ...(target ? { target } : {}),
    };
  }

  // HTTP(S) URL — may carry ?invite= or #invite= for browser-based invites
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const fromQuery = url.searchParams.get("invite") ?? "";
      const fromHash = url.hash.startsWith("#invite=")
        ? url.hash.slice("#invite=".length)
        : "";
      return {
        hubUrl: `${url.protocol}//${url.host}`,
        inviteCode: fromQuery || fromHash,
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
