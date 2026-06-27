import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HubCertification } from "../types";
import { formatPubkey, formatRelative } from "@wavvon/core";

export function IdentityCertificationsSection() {
  const [certs, setCerts] = useState<HubCertification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRefresh() {
    setLoading(true);
    setError(null);
    try {
      const fetched = await invoke<HubCertification[]>("fetch_my_certs");
      setCerts(fetched);
      setLoaded(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="settings-section">
      <label className="settings-label">Certifications</label>
      <p className="muted">
        Hub certifications vouch for your membership in good standing. Present them to new hubs that require reputation.
      </p>
      <button className="btn-secondary" onClick={handleRefresh} disabled={loading}>
        {loading ? "Refreshing…" : "Refresh certs"}
      </button>
      {error && <p className="error-text">{error}</p>}
      {loaded && certs.length === 0 && (
        <p className="muted" style={{ marginTop: 8 }}>No certifications yet. Join hubs and stay in good standing to earn them.</p>
      )}
      {certs.map((c, i) => (
        <div key={i} className="cert-row" style={{ marginTop: 8, padding: "8px", background: "var(--surface-2)", borderRadius: "var(--r-sm)" }}>
          <div>
            <strong>{c.payload.issuer_url}</strong>
            <span className="muted" style={{ marginLeft: 8 }}>
              issuer: {formatPubkey(c.payload.issuer_pubkey)}
            </span>
          </div>
          <div className="muted" style={{ fontSize: "var(--text-sm)", marginTop: 4 }}>
            Member since {formatRelative(c.payload.member_since)} ·{" "}
            {c.payload.pow_level !== null && <>PoW {c.payload.pow_level} · </>}
            Expires {formatRelative(c.payload.expires_at)} ·{" "}
            Standing: {c.payload.standing}
          </div>
        </div>
      ))}
    </div>
  );
}
