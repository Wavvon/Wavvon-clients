import { ed25519 } from "@noble/curves/ed25519";
import { hexToBytes } from "./hex";

/** What the person fills in for an invite-directory listing (invite-directory.md §1). */
export interface IdentityListingFields {
  name: string;
  tagline: string;
  tags: string[];
  languages: string[];
}

/** A published `wavvon.identity` document, as the directory serves it back. */
export interface IdentityListingDoc extends IdentityListingFields {
  format: "wavvon.identity";
  version: 1;
  pubkey: string;
  description: string;
  kind: "person" | "program";
  contact: { home_hub?: string; endpoint?: string };
  listed_at: number;
}

const TAG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const LANGUAGE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** Tags as the directory accepts them: lowercase slugs, at most ten. */
export function normalizeListingTags(raw: string): string[] {
  const out = raw.split(",").map((s) => s.trim().toLowerCase().replace(/\s+/g, "-")).filter((s) => TAG_RE.test(s));
  return [...new Set(out)].slice(0, 10);
}

/** Languages as BCP-47 tags, at most ten. */
export function normalizeListingLanguages(raw: string): string[] {
  const out = raw.split(",").map((s) => s.trim()).filter((s) => LANGUAGE_RE.test(s));
  return [...new Set(out)].slice(0, 10);
}

/** The exact bytes to sign and submit: a person's listing whose delivery
 *  route is their first home hub. `listed_at` must grow with every publish,
 *  since the directory keeps only the newest. */
export function buildIdentityListing(
  fields: IdentityListingFields,
  masterPubkeyHex: string,
  homeHub: string,
  listedAt: number,
): string {
  const doc: IdentityListingDoc = {
    format: "wavvon.identity",
    version: 1,
    pubkey: `ed25519:${masterPubkeyHex}`,
    name: fields.name.trim().slice(0, 48),
    tagline: fields.tagline.trim().slice(0, 160),
    description: "",
    kind: "person",
    tags: fields.tags,
    languages: fields.languages,
    contact: { home_hub: homeHub.replace(/\/+$/, "") },
    listed_at: listedAt,
  };
  return JSON.stringify(doc);
}

/** What a removal signs: it names the `listed_at` of the listing it removes,
 *  so a seen delete cannot remove a later re-publish. */
export function identityDeleteMessage(masterPubkeyHex: string, listedAt: number): string {
  return `wavvon-directory/delete/v1:identity:${masterPubkeyHex}:${listedAt}`;
}

/** Ed25519 over the UTF-8 bytes, base64url without padding, as the directory reads it. */
export function signDirectoryMessage(message: string, seedHex: string): string {
  const sig = ed25519.sign(new TextEncoder().encode(message), hexToBytes(seedHex));
  let bin = "";
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
