// Two formats these specs need from `@wavvon/core`, restated here.
//
// Playwright loads specs through Node's ESM loader, and `@wavvon/core`
// resolves to its CommonJS build there — importing a named export from it
// fails outright ("Named export 'formatPubkey' not found"). Both functions are
// three lines and both are covered by the package's own suite, so a local copy
// costs less than an interop shim; keep them in step with
// `packages/core/src/format.ts` and `parseHubInput.ts` if either changes.

/** `buildInviteLink` — the browser-facing `…/join/<code>` form. */
export function inviteLink(hubUrl: string, inviteCode: string): string {
  const host = hubUrl.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const isLocal = host.startsWith("localhost") || host.startsWith("127.");
  return `${isLocal ? "http" : "https"}://${host}/join/${inviteCode}`;
}

/**
 * How the member list labels someone with no display name.
 *
 * Not `formatPubkey` — `UserListGrouped` falls back to a bare
 * `public_key.slice(0, 16)`, so the dashed form never appears there.
 */
export function pubkeyLabel(key: string): string {
  return key.slice(0, 16);
}
