import { useEffect, useState } from "react";
import { formatPubkey, formatRelative } from "@wavvon/core";
import type { CertAdmissionSettings, CertIssuance } from "../../types";

export interface CertificationsSectionActions {
  listCertIssuances: () => Promise<CertIssuance[]>;
  getCertSettings: () => Promise<CertAdmissionSettings>;
  saveCertSettings: (settings: CertAdmissionSettings) => Promise<void>;
  issueCertManual: (subjectPubkey: string) => Promise<void>;
  revokeCert: (subjectPubkey: string) => Promise<void>;
  /** Member-badge grants use a separate hub route from hub-to-hub badges
   *  (ServerTagsSection); omitted where the Tauri command doesn't exist yet. */
  grantUserBadge?: (subjectPubkey: string, label: string) => Promise<void>;
}

interface Props {
  actions: CertificationsSectionActions;
}

export function CertificationsSection({ actions }: Props) {
  const [issuances, setIssuances] = useState<CertIssuance[]>([]);
  const [settings, setSettings] = useState<CertAdmissionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | string>("idle");
  const [manualTarget, setManualTarget] = useState("");
  const [trustedInput, setTrustedInput] = useState("");
  const [badgeTarget, setBadgeTarget] = useState("");
  const [badgeLabel, setBadgeLabel] = useState("");
  const [badgeStatus, setBadgeStatus] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [iss, sett] = await Promise.all([actions.listCertIssuances(), actions.getCertSettings()]);
      setIssuances(iss);
      setSettings(sett);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleSaveSettings() {
    if (!settings) return;
    setSaveStatus("saving");
    try {
      await actions.saveCertSettings(settings);
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
      await actions.issueCertManual(target);
      setManualTarget("");
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRevoke(pubkey: string) {
    if (!window.confirm(`Revoke certification for ${formatPubkey(pubkey)}?`)) return;
    try {
      await actions.revokeCert(pubkey);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleGrantBadge() {
    if (!actions.grantUserBadge || !badgeTarget.trim() || !badgeLabel.trim()) return;
    setBadgeStatus("Granting…");
    try {
      await actions.grantUserBadge(badgeTarget.trim(), badgeLabel.trim());
      setBadgeStatus(`Granted "${badgeLabel.trim()}"`);
      setBadgeTarget("");
      setBadgeLabel("");
      setTimeout(() => setBadgeStatus(""), 2500);
    } catch (e) {
      setBadgeStatus(String(e));
    }
  }

  if (loading) return <section><p className="muted">Loading…</p></section>;
  if (error || !settings) return <section><h1>Certifications</h1><p className="error-text">{error ?? "Could not load certification settings."}</p></section>;

  const goodCerts = issuances.filter((i) => i.standing === "good");
  const revokedCerts = issuances.filter((i) => i.standing === "revoked");

  return (
    <section>
      <h1>Certifications</h1>
      <p className="muted">
        This hub issues portable reputation certificates to eligible members.
        Certs can be presented to other hubs as proof of good standing.
      </p>

      <div className="settings-section">
        <label className="settings-label">Certification mode</label>
        <p className="muted">Controls whether incoming members can use hub certifications to skip certain onboarding gates.</p>
        <select
          value={settings.cert_mode}
          onChange={(e) => setSettings({ ...settings, cert_mode: e.target.value as CertAdmissionSettings["cert_mode"] })}
        >
          <option value="none">None — certifications ignored</option>
          <option value="any">Any valid cert — from any trusted hub</option>
          <option value="trusted">Trusted issuers only</option>
        </select>
      </div>

      {settings.cert_mode !== "none" && (
        <div className="cert-lockout-warning">
          <strong>Day-1 lockout risk:</strong> If you enable certification requirements, members
          (including yourself) without a valid cert matching your rules cannot join or authenticate.
          Make sure at least one admin has the required certifications before saving, or leave
          the mode on <em>None</em> until certs have been issued.
        </div>
      )}

      {settings.cert_mode === "trusted" && (
        <div className="settings-section">
          <label className="settings-label">Trusted issuer pubkeys</label>
          <p className="muted">Only certifications from these hub pubkeys are accepted.</p>
          {settings.cert_trusted_issuers.map((pk) => (
            <div key={pk} className="settings-row" style={{ marginBottom: 4 }}>
              <code className="pubkey-display">{formatPubkey(pk)}</code>
              <button
                className="btn-secondary"
                onClick={() => setSettings({ ...settings, cert_trusted_issuers: settings.cert_trusted_issuers.filter((x) => x !== pk) })}
              >
                Remove
              </button>
            </div>
          ))}
          <div className="settings-row" style={{ marginTop: 8 }}>
            <input
              type="text"
              value={trustedInput}
              onChange={(e) => setTrustedInput(e.target.value)}
              placeholder="Hub pubkey (hex)"
            />
            <button
              className="btn-secondary"
              onClick={() => {
                const t = trustedInput.trim();
                if (t && !settings.cert_trusted_issuers.includes(t)) {
                  setSettings({ ...settings, cert_trusted_issuers: [...settings.cert_trusted_issuers, t] });
                  setTrustedInput("");
                }
              }}
              disabled={!trustedInput.trim()}
            >
              Add
            </button>
          </div>
        </div>
      )}

      <div className="settings-section">
        <label className="settings-label">Auto-issue settings</label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.cert_auto_issue}
            onChange={(e) => setSettings({ ...settings, cert_auto_issue: e.target.checked })}
          />
          Automatically issue certifications to members in good standing
        </label>
        <div className="settings-row" style={{ marginTop: 8 }}>
          <label className="settings-label">Minimum standing days before auto-issue</label>
          <input
            type="number"
            min={1}
            max={3650}
            value={settings.cert_min_age_days}
            onChange={(e) => setSettings({ ...settings, cert_min_age_days: Number(e.target.value) })}
            style={{ width: 80 }}
          />
        </div>
        <div className="settings-row" style={{ marginTop: 8 }}>
          <label className="settings-label">Certification validity (days)</label>
          <input
            type="number"
            min={1}
            max={3650}
            value={settings.cert_validity_days}
            onChange={(e) => setSettings({ ...settings, cert_validity_days: Number(e.target.value) })}
            style={{ width: 80 }}
          />
        </div>
      </div>

      <div className="settings-row" style={{ marginBottom: 16 }}>
        <button onClick={handleSaveSettings} disabled={saveStatus === "saving"}>
          {saveStatus === "saving" ? "Saving…" : "Save settings"}
        </button>
        {saveStatus === "saved" && <span className="muted">Saved</span>}
        {saveStatus !== "idle" && saveStatus !== "saving" && saveStatus !== "saved" && (
          <span className="error-text">{saveStatus}</span>
        )}
      </div>

      <div className="settings-section">
        <label className="settings-label">Manual issue</label>
        <p className="muted">Issue a cert to a member ahead of the age threshold.</p>
        <div className="settings-row">
          <input
            type="text"
            value={manualTarget}
            onChange={(e) => setManualTarget(e.target.value)}
            placeholder="Member pubkey (hex)"
            style={{ flex: 1 }}
          />
          <button onClick={handleManualIssue} disabled={!manualTarget.trim()}>Issue cert</button>
        </div>
      </div>

      {actions.grantUserBadge && (
        <div className="settings-section">
          <label className="settings-label">Grant a badge</label>
          <p className="muted">
            Award a named achievement badge (e.g. "Raid Leader", "Top contributor"). It lands in the
            member's portfolio and links back to this community.
          </p>
          <div className="settings-row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
            <input
              type="text"
              value={badgeTarget}
              onChange={(e) => setBadgeTarget(e.target.value)}
              placeholder="Member pubkey (hex)"
              style={{ flex: 1, minWidth: 160 }}
            />
            <input
              type="text"
              value={badgeLabel}
              onChange={(e) => setBadgeLabel(e.target.value)}
              placeholder="Badge name"
              aria-label="Badge name"
              style={{ flex: 1, minWidth: 140 }}
            />
            <button onClick={handleGrantBadge} disabled={!badgeTarget.trim() || !badgeLabel.trim()}>Grant badge</button>
          </div>
          {badgeStatus && <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{badgeStatus}</p>}
        </div>
      )}

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
