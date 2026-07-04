import { rawFetch } from "../http";
import { loadSavedHubs } from "../storage";

export interface Certification {
  payload: {
    subject_kind: string;
    issuer_pubkey: string;
    issuer_url: string;
    subject_pubkey: string;
    member_since: number;
    standing: "good" | "revoked";
    pow_level: number | null;
    issued_at: number;
    expires_at: number;
    capabilities: string[];
  };
  signature: string;
  /** Which hub this cert was read from (client-side annotation). */
  hub_url?: string;
}

// A member's own earned certifications, read from every hub they're on
// (the endpoint is a public read). Deduped by signature. Mirrors the
// desktop `fetch_my_certs` fan-out.
export async function listMyCertifications(myPubkey: string): Promise<Certification[]> {
  const hubs = loadSavedHubs();
  const seen = new Set<string>();
  const out: Certification[] = [];
  for (const hub of hubs) {
    try {
      const res = await rawFetch(`${hub.hub_url}/identity/${myPubkey}/certs`);
      const certs = (await res.json()) as Certification[];
      for (const c of certs) {
        if (!seen.has(c.signature)) {
          seen.add(c.signature);
          out.push({ ...c, hub_url: hub.hub_url });
        }
      }
    } catch {
      // Skip unreachable hubs — surface the rest.
    }
  }
  return out;
}
