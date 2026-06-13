import { useState, useEffect } from "react";
import type { CertIssuance, CertAdmissionSettings } from "../types";
import { formatPubkey, formatRelative } from "@voxply/utils";
import {
  listCertIssuances,
  getCertSettings,
  saveCertSettings,
  issueCertManual,
  revokeCert,
} from "../platform/commands/hubAdmin";

interface Props {
  hubUrl: string;
  members: { public_key: string; display_name: string | null }[];
}

export function CertificationsSection({ hubUrl: _hubUrl, members }: Props) {
  const [issuances, setIssuances] = useState<CertIssuance[]>([]);
  const [settings, setSettings] = useState<CertAdmissionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | string>("idle");
  const [manualTarget, setManualTarget] = useState("");

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [iss, sett] = await Promise.all([listCertIssuances(), getCertSettings()]);
      setIssuances(iss);
      setSettings(sett);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings() {
    if (!settings) return;
    setSaveStatus("saving");
    try {
      await saveCertSettings(settings);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      setSaveStatus(String(e));
    }
  }

  async function handleManualIssue() {
    const target = manualTarget.trim();
    if (!target) return;
    try {
      await issueCertManual(target);
      setManualTarget("");
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRevoke(pubkey: string) {
    if (!confirm(`Revoke certification for ${formatPubkey(pubkey)}?`)) return;
    try {
      await revokeCert(pubkey);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  if (loading) return <section><p className="muted">Loading…</p></section>;
  if (error) return <section><p className="error-text">{error}</p></section>;

  const goodCerts = issuances.filter((i) => i.standing === "good");
  const revokedCerts = issuances.filter((i) => i.standing === "revoked");

  return (
    <section>
      <h1>Certifications</h1>
      <p className="muted">
        This hub issues portable reputation certificates to eligible members.
        Certs can be presented to other hubs as proof of good standing.
      </p>

      {settings && (
        <>
          <div className="settings-section">
            <label className="settings-label">Auto-issue settings</label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.cert_auto_issue}
                onChange={(e) => setSettings({ ...settings, cert_auto_issue: e.target.checked })}
              />
              Automatically issue certs to eligible members
            </label>
            <div className="settings-row" style={{ marginTop: 8 }}>
              <label className="settings-label" htmlFor="cert-min-age">Min. membership age (days)</label>
              <input
                id="cert-min-age"
                type="number"
                min={0}
                value={settings.cert_min_age_days}
                onChange={(e) => setSettings({ ...settings, cert_min_age_days: Number(e.target.value) })}
                style={{ width: 80 }}
              />
            </div>
            <div className="settings-row">
              <label className="settings-label" htmlFor="cert-validity">Cert validity (days)</label>
              <input
                id="cert-validity"
                type="number"
                min={1}
                value={settings.cert_validity_days}
                onChange={(e) => setSettings({ ...settings, cert_validity_days: Number(e.target.value) })}
                style={{ width: 80 }}
              />
            </div>
          </div>

          <div className="settings-section">
            <label className="settings-label">Admission gate</label>
            <p className="muted">Require incoming members to present a cert before being admitted.</p>
            <div className="settings-row">
              <label className="settings-label">Mode</label>
              <select
                value={settings.cert_mode}
                onChange={(e) => setSettings({ ...settings, cert_mode: e.target.value as "off" | "any" | "all" })}
              >
                <option value="off">Off (no cert required)</option>
                <option value="any">Any — satisfy trusted-issuer list or property rule</option>
                <option value="all">All — must satisfy trusted-issuer list</option>
              </select>
            </div>
          </div>

          {saveStatus === "saved" && <p className="muted">Saved.</p>}
          {saveStatus !== "idle" && saveStatus !== "saving" && saveStatus !== "saved" && (
            <p className="error-text">{saveStatus}</p>
          )}
          <button onClick={handleSaveSettings} disabled={saveStatus === "saving"}>
            {saveStatus === "saving" ? "Saving…" : "Save settings"}
          </button>
        </>
      )}

      <div className="settings-section">
        <label className="settings-label">Manual issue</label>
        <p className="muted">Issue a cert to a member ahead of the age threshold.</p>
        <div className="settings-row">
          <select value={manualTarget} onChange={(e) => setManualTarget(e.target.value)} style={{ flex: 1 }}>
            <option value="">— Select member —</option>
            {members.map((m) => (
              <option key={m.public_key} value={m.public_key}>
                {m.display_name || formatPubkey(m.public_key)}
              </option>
            ))}
          </select>
          <button onClick={handleManualIssue} disabled={!manualTarget}>Issue cert</button>
        </div>
      </div>

      <div className="settings-section">
        <label className="settings-label">Issued certs ({goodCerts.length})</label>
        {goodCerts.length === 0 && <p className="muted">None issued yet.</p>}
        {goodCerts.length > 0 && (
          <table className="members-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Issued</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {goodCerts.map((c) => (
                <tr key={c.subject_pubkey + c.issued_at}>
                  <td>
                    <span className="member-pk" title={c.subject_pubkey}>
                      {formatPubkey(c.subject_pubkey)}
                    </span>
                  </td>
                  <td>{formatRelative(c.issued_at)}</td>
                  <td>{formatRelative(c.expires_at)}</td>
                  <td>
                    <button className="btn-small danger" onClick={() => handleRevoke(c.subject_pubkey)}>
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {revokedCerts.length > 0 && (
        <div className="settings-section">
          <label className="settings-label">Revoked ({revokedCerts.length})</label>
          <table className="members-table">
            <thead>
              <tr><th>Member</th><th>Revoked</th></tr>
            </thead>
            <tbody>
              {revokedCerts.map((c) => (
                <tr key={c.subject_pubkey + c.issued_at}>
                  <td><span className="member-pk" title={c.subject_pubkey}>{formatPubkey(c.subject_pubkey)}</span></td>
                  <td>{formatRelative(c.issued_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
