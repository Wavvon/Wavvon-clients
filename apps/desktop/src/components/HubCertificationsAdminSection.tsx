import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CertSettings, IssuedCertRow } from "../types";
import { formatPubkey, formatRelative } from "@wavvon/core";

interface Props {
  hubUrl: string;
}

export function HubCertificationsAdminSection({ hubUrl }: Props) {
  const [settings, setSettings] = useState<CertSettings | null>(null);
  const [issued, setIssued] = useState<IssuedCertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | string>("idle");
  const [manualIssuePubkey, setManualIssuePubkey] = useState("");
  const [issueStatus, setIssueStatus] = useState<"idle" | "issuing" | "issued" | string>("idle");
  const [trustedInput, setTrustedInput] = useState("");

  useEffect(() => {
    Promise.all([
      invoke<CertSettings>("get_cert_settings", { hubUrl }).catch(() => null),
      invoke<IssuedCertRow[]>("list_issued_certs", { hubUrl }).catch(() => [] as IssuedCertRow[]),
    ]).then(([s, i]) => {
      if (s) setSettings(s);
      setIssued(i);
    }).finally(() => setLoading(false));
  }, [hubUrl]);

  async function handleSave() {
    if (!settings) return;
    setSaveStatus("saving");
    try {
      await invoke("save_cert_settings", { hubUrl, settings });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      setSaveStatus(String(e));
    }
  }

  async function handleManualIssue() {
    const pk = manualIssuePubkey.trim();
    if (!pk) return;
    setIssueStatus("issuing");
    try {
      const row = await invoke<IssuedCertRow>("issue_cert", { hubUrl, subjectPubkey: pk });
      setIssued((prev) => [row, ...prev]);
      setManualIssuePubkey("");
      setIssueStatus("issued");
      setTimeout(() => setIssueStatus("idle"), 2000);
    } catch (e) {
      setIssueStatus(String(e));
    }
  }

  async function handleRevoke(subjectPubkey: string) {
    try {
      await invoke("revoke_cert", { hubUrl, subjectPubkey });
      setIssued((prev) => prev.map((c) => c.subject_pubkey === subjectPubkey ? { ...c, standing: "revoked" as const } : c));
    } catch {
      // noop
    }
  }

  if (loading) return <p className="muted">Loading certifications…</p>;
  if (!settings) return <p className="muted">Could not load certification settings.</p>;

  return (
    <div>
      <div className="settings-section">
        <label className="settings-label">Certification mode</label>
        <p className="muted">Controls whether incoming members can use hub certifications to skip certain onboarding gates.</p>
        <select value={settings.cert_mode} onChange={(e) => setSettings((s) => s ? { ...s, cert_mode: e.target.value as CertSettings["cert_mode"] } : s)}>
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
          cert_mode on <em>None</em> until certs have been issued.
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
                onClick={() => setSettings((s) => s ? { ...s, cert_trusted_issuers: s.cert_trusted_issuers.filter((x) => x !== pk) } : s)}
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
                  setSettings((s) => s ? { ...s, cert_trusted_issuers: [...s.cert_trusted_issuers, t] } : s);
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
            onChange={(e) => setSettings((s) => s ? { ...s, cert_auto_issue: e.target.checked } : s)}
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
            onChange={(e) => setSettings((s) => s ? { ...s, cert_min_age_days: Number(e.target.value) } : s)}
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
            onChange={(e) => setSettings((s) => s ? { ...s, cert_validity_days: Number(e.target.value) } : s)}
            style={{ width: 80 }}
          />
        </div>
      </div>

      <div className="settings-row" style={{ marginBottom: 16 }}>
        <button onClick={handleSave} disabled={saveStatus === "saving"}>
          {saveStatus === "saving" ? "Saving…" : "Save settings"}
        </button>
        {saveStatus === "saved" && <span className="muted">Saved</span>}
        {saveStatus !== "idle" && saveStatus !== "saving" && saveStatus !== "saved" && (
          <span className="error-text">{saveStatus}</span>
        )}
      </div>

      <div className="settings-section">
        <label className="settings-label">Manual issue</label>
        <div className="settings-row">
          <input
            type="text"
            value={manualIssuePubkey}
            onChange={(e) => setManualIssuePubkey(e.target.value)}
            placeholder="Member pubkey (hex)"
          />
          <button onClick={handleManualIssue} disabled={issueStatus === "issuing" || !manualIssuePubkey.trim()}>
            {issueStatus === "issuing" ? "Issuing…" : "Issue cert"}
          </button>
        </div>
        {issueStatus === "issued" && <p className="muted">Cert issued.</p>}
        {issueStatus !== "idle" && issueStatus !== "issuing" && issueStatus !== "issued" && (
          <p className="error-text">{issueStatus}</p>
        )}
      </div>

      <div className="settings-section">
        <label className="settings-label">Issued certifications</label>
        {issued.length === 0 && <p className="muted">None issued yet.</p>}
        {issued.map((c) => (
          <div key={c.id} className="settings-row" style={{ marginBottom: 8 }}>
            <div>
              <code className="pubkey-display">{c.subject_display ?? formatPubkey(c.subject_pubkey)}</code>
              <span className="muted" style={{ marginLeft: 8 }}>issued {formatRelative(c.issued_at)}</span>
              {c.standing === "revoked" && <span className="muted" style={{ marginLeft: 8, color: "var(--color-error, red)" }}>revoked</span>}
            </div>
            {c.standing !== "revoked" && (
              <button className="btn-secondary" onClick={() => handleRevoke(c.subject_pubkey)}>Revoke</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
