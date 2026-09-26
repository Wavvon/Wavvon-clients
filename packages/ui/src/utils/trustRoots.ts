// Whose signatures this viewer chooses to believe (server-tags.md Part 4).
//
// A badge or a certification from an issuer the viewer has no relationship
// with says nothing to them — it is a signature by a stranger. A trust root is
// how they answer that: `{pubkey, label}`, entirely their own decision.
//
// **Rendering only.** A trust root never satisfies a hub's `cert_mode` gate:
// that is the admin's `cert_trusted_issuers`, and letting a viewer's
// preference clear an admin's bar would be the pass factory
// hub-certifications.md §11 refuses. The two lists have the same shape and
// opposite authority, which is exactly why they are separate settings.
//
// The set rides in the synced prefs blob rather than localStorage — whom you
// trust is a choice about yourself, so it follows the identity across devices
// (decisions.md, "Settings follow the identity").

export interface TrustRoot {
  /** Hex Ed25519 public key of the issuing hub. */
  pubkey: string;
  /** The viewer's own note. Never shown as an attestation of anything. */
  label?: string;
}

/**
 * Parse the stored value.
 *
 * Tolerant by construction: this is user-editable state in a synced blob, and
 * a malformed entry must cost that entry rather than the whole list — a viewer
 * who loses every trust root silently goes back to "(unknown issuer)"
 * everywhere with no explanation.
 */
export function parseTrustRoots(raw: string | null | undefined): TrustRoot[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  const roots: TrustRoot[] = [];
  for (const entry of parsed) {
    const pubkey = normalizePubkey(
      typeof entry === "string" ? entry : (entry as TrustRoot | null)?.pubkey,
    );
    if (!pubkey || seen.has(pubkey)) continue;
    seen.add(pubkey);
    const label =
      typeof entry === "object" && entry !== null && typeof (entry as TrustRoot).label === "string"
        ? (entry as TrustRoot).label!.trim().slice(0, 64)
        : undefined;
    roots.push(label ? { pubkey, label } : { pubkey });
  }
  return roots;
}

export function serializeTrustRoots(roots: TrustRoot[]): string {
  return JSON.stringify(roots);
}

/**
 * A hub pubkey, or null when it is not one.
 *
 * 64 hex characters, lowercased. Checked rather than assumed because the add
 * form is a paste box: a pubkey with a stray space or a copied `0x` prefix
 * would otherwise be stored and then never match anything, which reads as
 * "trusting that issuer did nothing".
 */
export function normalizePubkey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(trimmed) ? trimmed : null;
}

/** Add a root, or update the label of one already there. */
export function addTrustRoot(roots: TrustRoot[], pubkey: string, label?: string): TrustRoot[] {
  const normalized = normalizePubkey(pubkey);
  if (!normalized) return roots;
  const clean = label?.trim().slice(0, 64) || undefined;
  const without = roots.filter((r) => r.pubkey !== normalized);
  return [...without, clean ? { pubkey: normalized, label: clean } : { pubkey: normalized }];
}

export function removeTrustRoot(roots: TrustRoot[], pubkey: string): TrustRoot[] {
  const normalized = normalizePubkey(pubkey);
  return roots.filter((r) => r.pubkey !== normalized);
}

/**
 * Does this viewer have a reason to believe `issuerPubkey`?
 *
 * Two sources today: a hub they are a member of (they already chose to be
 * there) and an explicit trust root. Deliberately not transitive — a trust
 * root vouches for what it signed, never for whom it trusts (ROADMAP 💤,
 * "badge transitivity").
 */
export function isTrustedIssuer(
  issuerPubkey: string | null | undefined,
  roots: TrustRoot[],
  myHubPubkeys: readonly string[] = [],
): boolean {
  const issuer = normalizePubkey(issuerPubkey);
  if (!issuer) return false;
  if (roots.some((r) => r.pubkey === issuer)) return true;
  return myHubPubkeys.some((pk) => normalizePubkey(pk) === issuer);
}
