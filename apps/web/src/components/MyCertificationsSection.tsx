import { useEffect, useState } from "react";
import { listMyCertifications } from "@platform";
import type { Certification } from "@platform";

// A member's own earned hub certifications (read-only). Distinct from the
// admin CertificationsSection, which issues/revokes certs to others.
export function MyCertificationsSection({ publicKey }: { publicKey: string | null }) {
  const [certs, setCerts] = useState<Certification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    listMyCertifications(publicKey)
      .then((c) => { if (!cancelled) setCerts(c); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [publicKey]);

  return (
    <div className="settings-section" style={{ marginTop: 20 }}>
      <label className="settings-label">My certifications</label>
      <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
        Attestations hubs have issued to your identity.
      </p>
      {error && <p className="error-text">{error}</p>}
      {certs === null ? (
        <p className="muted">Loading…</p>
      ) : certs.length === 0 ? (
        <p className="muted">No certifications yet.</p>
      ) : (
        certs.map((c) => (
          <div key={c.signature} className="settings-row" style={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <span>
              🏅 {c.payload.issuer_url}
              {c.payload.standing === "revoked" && <span className="muted"> · revoked</span>}
            </span>
            <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
              member since {new Date(c.payload.member_since * 1000).toLocaleDateString()}
              {c.payload.capabilities.length > 0 && ` · ${c.payload.capabilities.join(", ")}`}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
